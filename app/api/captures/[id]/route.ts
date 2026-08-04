import { NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { getCaptureForUser } from '@/lib/db/queries/trades'

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
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params

  if (!isValidUuid(id)) {
    return noEncontrada()
  }

  const capture = await getCaptureForUser(getDb(), user.id, id)
  if (!capture) {
    return noEncontrada()
  }

  const blob = await get(capture.blobPathname, { access: 'private' })
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
