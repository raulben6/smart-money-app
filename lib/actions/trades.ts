'use server'
import '@/lib/validation/zod-config'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { del } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { tradeSchema, journalSchema } from '@/lib/validation/trade'
import { isValidUuid } from '@/lib/validation/uuid'
import { insertTradeWithJournal, updateTradeById, upsertJournal, deleteTradeById, getTradeDetail } from '@/lib/db/queries/trades'
import { levelSnapshot, notifyNewLevelUps } from '@/lib/level-notify'
import type { ActionResult } from './types'

const CAMPOS_INVALIDOS = 'Revisa los campos marcados'
const SIN_PERMISO = 'No se encontró la operación o no tienes permiso para modificarla'
const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

function revalidateTradeViews() {
  revalidatePath('/dashboard')
  revalidatePath('/calendario')
  // Un trade puede cambiar el nivel derivado (banner, Mi nivel, badge de
  // felicitación en notificaciones) — ronda 16.
  revalidatePath('/mi-nivel')
  revalidatePath('/notificaciones')
}

/** Crea un trade y (opcionalmente) su journal inicial para el usuario autenticado. */
export async function createTrade(raw: unknown, journalRaw?: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()

  const parsedTrade = tradeSchema.safeParse(raw)
  const parsedJournal = journalRaw === undefined ? undefined : journalSchema.safeParse(journalRaw)

  if (!parsedTrade.success || (parsedJournal && !parsedJournal.success)) {
    const fieldErrors: Record<string, string[]> = {}
    if (!parsedTrade.success) Object.assign(fieldErrors, z.flattenError(parsedTrade.error).fieldErrors)
    if (parsedJournal && !parsedJournal.success) Object.assign(fieldErrors, z.flattenError(parsedJournal.error).fieldErrors)
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors }
  }

  try {
    const db = getDb()
    const before = await levelSnapshot(db, user.id)
    const id = await insertTradeWithJournal(db, user.id, parsedTrade.data, parsedJournal?.data)
    await notifyNewLevelUps(db, user.id, before)
    revalidateTradeViews()
    return { ok: true, data: { id } }
  } catch (err) {
    console.error('[createTrade]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Actualiza un trade existente del usuario autenticado. */
export async function updateTrade(tradeId: string, raw: unknown): Promise<ActionResult<null>> {
  const user = await requireUser()

  // `tradeId` llega desde el cliente sin garantía de forma en runtime (un Server
  // Action es un endpoint RPC público; la anotación `: string` no se valida sola).
  // Si no tiene forma de UUID, tratamos igual que "no autorizado" (mismo mensaje
  // que un id ajeno) en vez de dejar que Postgres rechace la query con un 22P02.
  if (!isValidUuid(tradeId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = tradeSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    const before = await levelSnapshot(db, user.id)
    const ok = await updateTradeById(db, user.id, tradeId, parsed.data)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    await notifyNewLevelUps(db, user.id, before)
    revalidateTradeViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[updateTrade]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Crea o actualiza el journal de un trade del usuario autenticado. */
export async function saveJournal(tradeId: string, raw: unknown): Promise<ActionResult<null>> {
  const user = await requireUser()

  if (!isValidUuid(tradeId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = journalSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    const ok = await upsertJournal(db, user.id, tradeId, parsed.data)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidateTradeViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[saveJournal]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Elimina un trade (y su journal/capturas por cascade) del usuario autenticado. */
export async function removeTrade(tradeId: string): Promise<ActionResult<null>> {
  const user = await requireUser()

  if (!isValidUuid(tradeId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()
    // Pathnames de las capturas del trade ANTES de borrar la fila: una vez
    // borrado el trade (cascade), `getTradeDetail` ya no encontraría nada.
    const detail = await getTradeDetail(db, user.id, tradeId)
    const before = await levelSnapshot(db, user.id)
    const ok = await deleteTradeById(db, user.id, tradeId)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    await notifyNewLevelUps(db, user.id, before)

    if (detail && detail.captures.length > 0) {
      // Best-effort: si Blob falla, el trade ya se borró y no debe fallar la
      // acción por unos blobs huérfanos (se registran para limpieza manual).
      try {
        await del(detail.captures.map((c) => c.blobPathname))
      } catch (err) {
        console.error('[removeTrade] blob del', err)
      }
    }

    revalidateTradeViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[removeTrade]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}
