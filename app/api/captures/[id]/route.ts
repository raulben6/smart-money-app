import { NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { getCaptureForUser } from '@/lib/db/queries/trades'
import { getCaptureForStudent } from '@/lib/db/queries/mentor'

// Función (no una constante `Response` compartida): el body de un `Response`
// es un stream que solo se puede leer una vez, así que reusar la misma
// instancia entre peticiones distintas rompería a partir de la segunda.
function noEncontrada() {
  return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
}

/**
 * Descarga autenticada de una captura guardada en el store privado de Vercel
 * Blob. `requireUser()` redirige a `/sign-in` si no hay sesión (mismo
 * comportamiento que el resto de la app, no un 401 JSON). El id llega como
 * segmento de ruta sin garantía de forma (no pasó por Zod ni por un Server
 * Action), así que se valida como UUID antes de tocar la base de datos.
 *
 * Task 12: si quien pide la captura es un mentor, se autoriza primero vía
 * `getCaptureForStudent` (cualquier captura de un trade de un estudiante) — no
 * `getCaptureForUser`, que solo encuentra capturas del propio `user.id` y siempre
 * devolvería 404 para las de un alumno. Con fallback al flujo de dueño (`getCaptureForUser`)
 * si eso no encuentra nada: `role` es promovible en caliente (`isMentorEmail`, `lib/auth.ts`)
 * y un mentor real de este programa puede ser un estudiante promovido con sus propios trades
 * de Fase 1 — sin este fallback, esa cuenta perdería acceso a sus propias capturas en cuanto
 * `role` pasara a 'mentor'. El resto de roles (estudiante no promovido) sigue el flujo de
 * dueño de siempre, sin cambios.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params

  if (!isValidUuid(id)) {
    return noEncontrada()
  }

  const db = getDb()
  const capture =
    user.role === 'mentor'
      ? (await getCaptureForStudent(db, user.id, id)) ?? (await getCaptureForUser(db, user.id, id))
      : await getCaptureForUser(db, user.id, id)
  if (!capture) {
    return noEncontrada()
  }

  // `useCache: false`: los uploads reemplazan el mismo pathname (`allowOverwrite`
  // en `uploadCapture`), y el cache de la CDN de `get()` (activo por defecto)
  // podía seguir sirviendo los bytes viejos tras un reemplazo.
  const blob = await get(capture.blobPathname, { access: 'private', useCache: false })
  if (!blob || !blob.stream) {
    return noEncontrada()
  }

  return new NextResponse(blob.stream, {
    headers: {
      'Content-Type': capture.contentType,
      'Cache-Control': 'private, max-age=60',
    },
  })
}
