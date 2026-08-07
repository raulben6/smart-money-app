'use server'
import '@/lib/validation/zod-config'
import { revalidatePath } from 'next/cache'
import { clerkClient } from '@clerk/nextjs/server'
import { z } from 'zod'
import { requireMentor } from '@/lib/auth'
import { getAppUrl } from '@/lib/app-url'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { goalSchema, levelSchema, feedbackSchema, inviteSchema } from '@/lib/validation/mentor'
import { insertGoal, updateGoalById, deleteGoalById } from '@/lib/db/queries/goals'
import { updateLevelById, grantLevel, revokeGrant, listLevels } from '@/lib/db/queries/levels'
import {
  getTradeDetailForStudent,
  listTradesForStudent,
  setStudentStartLevel,
  getStudentById,
  archiveStudentById,
} from '@/lib/db/queries/mentor'
import { insertNotification } from '@/lib/db/queries/notifications'
import { levelSnapshot, notifyNewLevelUps } from '@/lib/level-notify'
import { isClerkNotFoundError } from '@/lib/clerk-errors'
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

    // SEGURIDAD (hallazgo del revisor de Task 9, controller-asignado a esta Task 16):
    // `insertNotification` valida mentor/estudiante pero NO verifica que `tradeId`
    // pertenezca al estudiante DESTINATARIO (`studentId`) — solo que el trade exista, vía
    // la FK `notifications.trade_id`. Sin este chequeo, un mentor podría (por error o a
    // propósito) adjuntar el id de un trade de OTRO estudiante a la notificación de este.
    // Se reusa `getTradeDetailForStudent` (la misma consulta que ya autoriza el modal de
    // solo lectura del mentor, Task 12): exige mentor+dueño+trade en una sola query, así
    // que un `tradeId` que no pertenezca a `studentId` (o que no exista) se rechaza aquí
    // como SIN_PERMISO antes de intentar el INSERT — lo que también vuelve inalcanzable el
    // caso, documentado antes en este comentario, de un `tradeId` con forma de UUID válida
    // pero inexistente reventando la FK y cayendo al catch como ERROR_INESPERADO.
    if (parsed.data.tradeId !== null) {
      const trade = await getTradeDetailForStudent(db, mentor.id, studentId, parsed.data.tradeId)
      if (!trade) {
        return { ok: false, error: SIN_PERMISO }
      }
    }

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
/**
 * Da de baja a un estudiante (ronda 17, decisión del usuario: ARCHIVAR, nunca
 * borrar): revoca su acceso en Clerk y archiva su fila — desaparece del panel,
 * comparador y métricas, pero sus datos quedan para el historial y para la
 * reconexión automática si su correo es re-invitado (ver lib/db/queries/users).
 *
 * Orden deliberado: Clerk PRIMERO — jamás archivar dejando la cuenta viva (el
 * alumno seguiría entrando mientras el mentor ya no lo ve). Si Clerk ya no
 * tiene la cuenta (borrada a mano desde su dashboard), se continúa: el archivo
 * en nuestra base es justo lo que faltaba. Fallo parcial (Clerk borrado pero
 * el archivo falla): el alumno queda sin acceso y aún visible — REINTENTAR el
 * botón sana (el 404 de Clerk se tolera y el archivo se vuelve a intentar).
 */
export async function removeStudent(studentId: string): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  try {
    const db = getDb()
    const student = await getStudentById(db, mentor.id, studentId)
    if (!student) {
      return { ok: false, error: SIN_PERMISO }
    }

    try {
      const client = await clerkClient()
      await client.users.deleteUser(student.clerkId)
    } catch (err) {
      if (!isClerkNotFoundError(err)) throw err
    }

    const archived = await archiveStudentById(db, mentor.id, studentId)
    if (!archived) {
      return { ok: false, error: SIN_PERMISO }
    }

    revalidatePath('/panel')
    revalidatePath('/comparador')
    revalidatePath('/niveles')
    revalidatePath('/objetivos-estudiantes')
    revalidatePath('/mensajes')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[removeStudent]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/**
 * LIMITACIÓN ACEPTADA (ronda 16, anotada por el revisor): si el mentor RELAJA
 * una definición (baja la meta o un gate) y eso completa niveles de algunos
 * estudiantes, NO se genera felicitación — el siguiente snapshot ya los ve
 * completados. Barrer a todos los estudiantes en cada edición de definiciones
 * sería costoso y felicitar por un cambio de vara es discutible; se documenta
 * en vez de implementarse. Mismo criterio para trades previos al onboarding.
 */
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
    const before = await levelSnapshot(db, studentId)
    const ok = await grantLevel(db, mentor.id, studentId, levelId)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }
    // El desbloqueo manual puede COMPLETAR el nivel (es su último gate): el
    // estudiante recibe la misma felicitación que si lo hubiera cruzado con
    // trades (ronda 16).
    await notifyNewLevelUps(db, studentId, before)
    revalidateLevelViews()
    revalidatePath('/notificaciones')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[grantStudentLevel]', err)
    return { ok: false, error: ERROR_INESPERADO }
  }
}

/**
 * Asigna manualmente el nivel INICIAL de un estudiante (ronda 16): fija
 * `startLevelPosition` y toma como baseline el netPnl actual del estudiante —
 * el nivel asignado arranca desde cero en el momento de la asignación (regla
 * de "el progreso regresa a 0", ver computeLevelStatus). A propósito NO
 * genera felicitaciones: es una decisión administrativa, no un logro.
 */
export async function assignStudentLevel(studentId: string, raw: unknown): Promise<ActionResult<null>> {
  const mentor = await requireMentor()

  if (!isValidUuid(studentId)) {
    return { ok: false, error: SIN_PERMISO }
  }

  const parsed = z.object({ position: z.number().int().min(1).max(99) }).safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const db = getDb()

    // La posición debe corresponder a un nivel definido del programa — un
    // número inventado dejaría al estudiante en una escalera vacía.
    const levels = await listLevels(db)
    if (!levels.some((l) => l.position === parsed.data.position)) {
      return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: { position: ['Ese nivel no existe'] } }
    }

    // Baseline = netPnl actual del estudiante (la query ya exige mentor+estudiante).
    const trades = await listTradesForStudent(db, mentor.id, studentId)
    const baselineNet = trades.reduce((sum, t) => sum + t.pnlUsd, 0)

    const ok = await setStudentStartLevel(db, mentor.id, studentId, parsed.data.position, baselineNet)
    if (!ok) {
      return { ok: false, error: SIN_PERMISO }
    }

    revalidateLevelViews()
    revalidatePath('/panel')
    revalidatePath('/comparador')
    revalidatePath('/calendario')
    revalidatePath('/dashboard')
    return { ok: true, data: null }
  } catch (err) {
    console.error('[assignStudentLevel]', err)
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
 *
 * `redirectUrl` es OBLIGATORIO en la práctica: sin él, el ticket de invitación no lleva el
 * claim `rurl` y, tras aceptar el correo, el usuario queda varado en el portal de Clerk en
 * vez de volver a esta app (hallazgo del smoke de Task 17, verificado en vivo inspeccionando
 * el JWT del ticket). Se apunta a `/sign-up`: `<SignUp/>` (`app/(auth)/sign-up/[[...sign-up]]`)
 * consume el ticket automáticamente vía el query param que Clerk anexa a `redirectUrl`.
 */
export async function inviteStudent(raw: unknown): Promise<ActionResult<null>> {
  await requireMentor()

  const parsed = inviteSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: CAMPOS_INVALIDOS, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const client = await clerkClient()
    await client.invitations.createInvitation({
      emailAddress: parsed.data.email,
      notify: true,
      redirectUrl: `${getAppUrl()}/sign-up`,
    })
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
