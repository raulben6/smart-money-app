'use server'
import '@/lib/validation/zod-config'
import { revalidatePath } from 'next/cache'
import { clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { goalSchema, levelSchema, feedbackSchema, inviteSchema } from '@/lib/validation/mentor'
import { insertGoal, updateGoalById, deleteGoalById } from '@/lib/db/queries/goals'
import { updateLevelById, grantLevel, revokeGrant } from '@/lib/db/queries/levels'
import { insertNotification } from '@/lib/db/queries/notifications'
import type { ActionResult } from './types'

const CAMPOS_INVALIDOS = 'Revisa los campos marcados'
const SIN_PERMISO = 'No se encontró el recurso o no tienes permiso para esta acción'
const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'
const INVITACION_DUPLICADA = 'Ya existe una invitación para ese correo'

function revalidateLevelViews() {
  revalidatePath('/niveles')
  revalidatePath('/mi-nivel')
}

/**
 * Envía retroalimentación a un estudiante (crea una notificación dirigida a él).
 * `studentId` llega desde el cliente sin garantía de forma en runtime (un Server
 * Action es un endpoint RPC público), igual que `tradeId` en `lib/actions/trades.ts`.
 */
export async function sendFeedback(studentId: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = feedbackSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    // `insertNotification` valida mentor/estudiante y devuelve `null` si alguno
    // de los dos falla. Pero si `parsed.data.tradeId` tiene forma de UUID válida
    // y NO corresponde a ningún trade real, la FK `notifications.trade_id` hace
    // que el INSERT lance en vez de devolver `null` — ese caso cae al catch de
    // abajo como ERROR_INESPERADO (documentado: no se puede distinguir de un
    // error genérico de base de datos sin una consulta extra de existencia).
    const id = await insertNotification(db, mentor.id, { userId: studentId, ...parsed.data })
    if (!id) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidatePath('/mensajes')
    revalidatePath('/notificaciones')
    return { ok: true, data: { id } }
  } catch (err) {
    console.error('[sendFeedback]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Crea un objetivo para un estudiante. */
export async function createGoal(studentId: string, raw: unknown): Promise<ActionResult<{ id: string }>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = goalSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    const id = await insertGoal(db, mentor.id, studentId, parsed.data)
    if (!id) {
      return { ok: false, error: SIN_PERMISO }
    }
    // '/objetivos' (vista del estudiante) y '/objetivos-estudiantes' (vista del mentor,
    // ledger F2-T11 — NO '/objetivos', que ya usa el grupo (app) del estudiante).
    revalidatePath('/objetivos')
    revalidatePath('/objetivos-estudiantes')
    return { ok: true, data: { id } }
  } catch (err) {
    console.error('[createGoal]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Actualiza un objetivo existente (de cualquier estudiante). */
export async function updateGoal(goalId: string, raw: unknown): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(goalId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = goalSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    const ok = await updateGoalById(db, mentor.id, goalId, parsed.data)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidatePath('/objetivos')
    revalidatePath('/objetivos-estudiantes')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[updateGoal]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Elimina un objetivo. */
export async function removeGoal(goalId: string): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(goalId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()
    const ok = await deleteGoalById(db, mentor.id, goalId)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidatePath('/objetivos')
    revalidatePath('/objetivos-estudiantes')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[removeGoal]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Actualiza los parámetros de un nivel (meta, PF mínimo, trades mínimos, drawdown máximo). */
export async function updateLevel(levelId: string, raw: unknown): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(levelId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = levelSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()
    const ok = await updateLevelById(db, mentor.id, levelId, parsed.data)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidateLevelViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[updateLevel]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Otorga manualmente un nivel (`manualUnlock`) a un estudiante. */
export async function grantStudentLevel(studentId: string, levelId: string): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId) || !isValidUuid(levelId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()
    // `grantLevel` valida mentor/estudiante y devuelve `false` si alguno falla,
    // PERO si `levelId` tiene forma de UUID válida y no corresponde a ningún
    // nivel real, la FK `manual_level_grants.level_id` hace que el INSERT
    // lance en vez de devolver `false` (mismo caso que `sendFeedback` arriba
    // con `tradeId` — ver nota del revisor de Task 9). Cae al catch como
    // ERROR_INESPERADO.
    const ok = await grantLevel(db, mentor.id, studentId, levelId)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidateLevelViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[grantStudentLevel]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/** Revoca un nivel otorgado manualmente a un estudiante. */
export async function revokeStudentLevel(studentId: string, levelId: string): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId) || !isValidUuid(levelId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()
    const ok = await revokeGrant(db, mentor.id, studentId, levelId)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    revalidateLevelViews()
    return { ok: true, data: null }
  } catch (err) {
    console.error('[revokeStudentLevel]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/**
 * true si `err` es el error de Clerk por invitación/usuario duplicado
 * (`ClerkAPIResponseError` con `errors[0].code === 'duplicate_record'`). Se
 * inspecciona la forma del error directamente (duck typing) en vez de importar
 * `isClerkAPIResponseError` de `@clerk/backend`: ese paquete es una dependencia
 * TRANSITIVA de `@clerk/nextjs` (no está declarada en `package.json`), así que
 * depender de su subpath de exports (`@clerk/backend/errors`) sería frágil.
 */
function isDuplicateInvitationError(err: unknown): boolean {
  const shape = err as { errors?: { code?: string }[] } | null | undefined
  return Array.isArray(shape?.errors) && shape.errors.some((e) => e?.code === 'duplicate_record')
}

/**
 * Invita a un estudiante por correo a través de la API de invitaciones de Clerk
 * (nivel de instancia, no de organización: esta app no usa Organizations).
 * No testeada unitariamente (llamada de red real) — ver Task 17/18.
 */
export async function inviteStudent(raw: unknown): Promise<ActionResult<null>> {
  await requireMentor()

  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const client = await clerkClient()
    await client.invitations.createInvitation({ emailAddress: parsed.data.email, notify: true })
    return { ok: true, data: null }
  } catch (err) {
    if (isDuplicateInvitationError(err)) {
      return { ok: false, error: INVITACION_DUPLICADA }
    }
    console.error('[inviteStudent]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/**
 * Lista las invitaciones pendientes de la instancia de Clerk, para la pantalla
 * de invitaciones del mentor. No testeada unitariamente (llamada de red real).
 */
export async function listPendingInvitations(): Promise<ActionResult<{ email: string; status: string; createdAt: number }[]>> {
  await requireMentor()

  try {
    const client = await clerkClient()
    const { data } = await client.invitations.getInvitationList({ status: 'pending' })
    return {
      ok: true,
      data: data.map((invitation) => ({
        email: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
      })),
    }
  } catch (err) {
    console.error('[listPendingInvitations]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}
