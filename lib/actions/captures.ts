'use server'
import { put, del } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { getTradeDetail, getCaptureForUser, upsertCapture, deleteCaptureById } from '@/lib/db/queries/trades'
import type { ActionResult } from './types'

const SIN_PERMISO = 'No se encontró la operación o no tienes permiso para modificarla'
const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'
const FORMATO_INVALIDO = 'Formato no permitido (PNG, JPG o WebP)'
const TAMANO_INVALIDO = 'La captura no puede superar 5 MB'

const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp'])
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024

/**
 * Sube la captura (`before`/`after`) de un trade del usuario autenticado a
 * Vercel Blob (store privado) y hace upsert de la fila en `trade_captures`.
 * El archivo llega en el campo `file` de `formData` (un Server Action recibe
 * `FormData` para poder enviar binarios desde un `<form>`/`input type=file`).
 *
 * Validamos dueño del trade ANTES de subir el archivo a Blob: así una petición
 * no autorizada (trade ajeno o inexistente) nunca gasta una llamada de red a
 * Blob ni deja basura subida.
 */
export async function uploadCapture(
  tradeId: string,
  phase: string,
  formData: FormData,
): Promise<ActionResult<{ captureId: string }>> {
  const user = await requireUser()

  // `tradeId`/`phase` llegan desde el cliente sin garantía de forma en runtime
  // (un Server Action es un endpoint RPC público; las anotaciones de tipo no
  // se validan solas). Un id malformado o una fase fuera de las dos válidas se
  // trata igual que "no autorizado", como en el resto de acciones de trades.
  if (!isValidUuid(tradeId)) {
    return { ok: false, error: SIN_PERMISO }
  }
  if (phase !== 'before' && phase !== 'after') {
    return { ok: false, error: SIN_PERMISO }
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { ok: false, error: FORMATO_INVALIDO }
  }
  if (!TIPOS_PERMITIDOS.has(file.type)) {
    return { ok: false, error: FORMATO_INVALIDO }
  }
  if (file.size > TAMANO_MAXIMO_BYTES) {
    return { ok: false, error: TAMANO_INVALIDO }
  }

  try {
    const db = getDb()

    const detail = await getTradeDetail(db, user.id, tradeId)
    if (!detail) {
      return { ok: false, error: SIN_PERMISO }
    }

    const pathname = `captures/${tradeId}/${phase}`
    const blob = await put(pathname, file, {
      access: 'private',
      allowOverwrite: true,
      contentType: file.type,
    })

    const captureId = await upsertCapture(db, user.id, tradeId, phase, blob.pathname, file.type)
    if (!captureId) {
      // El trade era del usuario hace un instante (chequeo de arriba) pero ya
      // no lo es (p. ej. lo borró en otra pestaña mientras se subía el
      // archivo). El blob ya subido queda huérfano en el store; no se puede
      // referenciar desde ninguna fila, así que se descarta.
      return { ok: false, error: SIN_PERMISO }
    }

    return { ok: true, data: { captureId } }
  } catch (err) {
    console.error('[uploadCapture]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Elimina una captura (blob + fila) del usuario autenticado. */
export async function deleteCapture(captureId: string): Promise<ActionResult<null>> {
  const user = await requireUser()

  if (!isValidUuid(captureId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()

    const capture = await getCaptureForUser(db, user.id, captureId)
    if (!capture) {
      return { ok: false, error: SIN_PERMISO }
    }

    // Se borra el blob antes que la fila: si el borrado de la fila fallara
    // después, quedaría una fila con una referencia rota (peor que un blob
    // huérfano, que simplemente no lo referencia nadie).
    await del(capture.blobPathname)
    await deleteCaptureById(db, user.id, captureId)

    return { ok: true, data: null }
  } catch (err) {
    console.error('[deleteCapture]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}
