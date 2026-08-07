'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { markAllReadForUser } from '@/lib/db/queries/notifications'
import type { ActionResult } from './types'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/** Marca como leídas todas las notificaciones propias (del usuario autenticado). */
export async function markMyNotificationsRead(): Promise<ActionResult<null>> {
  const user = await requireUser()

  try {
    const db = getDb()
    await markAllReadForUser(db, user.id)
    revalidatePath('/notificaciones')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[markMyNotificationsRead]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}
