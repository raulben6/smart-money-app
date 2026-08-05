import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { notifications, users, type DbNotification } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'
import { isMentor, isStudent } from '@/lib/db/queries/mentor'
import type { FeedbackFormValues } from '@/lib/validation/mentor'

/**
 * Crea una notificación dirigida a `values.userId`; `null` si `mentorId` no es mentor
 * o si el destinatario no existe / no es un estudiante (nunca se notifica a otro
 * mentor ni a un id inexistente).
 *
 * A diferencia del patrón "spread + pin de columnas de identidad al final" usado en
 * el resto de esta capa, aquí se construye el objeto de `.values()` enumerando cada
 * campo de forma explícita en vez de spread-ear `values` completo. Motivo: a
 * diferencia de `TradeFormValues`/`GoalFormValues`/`LevelFormValues` (que nunca
 * declaran columnas de identidad), el tipo de este parámetro SÍ incluye `userId`
 * legítimamente (es el destinatario), así que un spread + "pin de userId al final"
 * sería un no-op que no protegería nada: no evitaría que una clave hostil `id` (fuera
 * del tipo `FeedbackFormValues`, colada vía un cast) se filtrara hacia el INSERT e
 * intentara colisionar con la clave primaria de una notificación ya existente. La
 * enumeración explícita hace imposible que cualquier clave ajena al tipo declarado
 * (p.ej. `id`, `readAt`, `createdAt`) llegue nunca a la query.
 */
export async function insertNotification(
  db: Db,
  mentorId: string,
  values: { userId: string } & FeedbackFormValues,
): Promise<string | null> {
  if (!(await isMentor(db, mentorId))) return null
  if (!(await isStudent(db, values.userId))) return null

  const [row] = await db
    .insert(notifications)
    .values({
      userId: values.userId,
      kind: values.kind,
      title: values.title,
      body: values.body,
      tradeId: values.tradeId,
    })
    .returning()

  return row.id
}

/** Notificaciones de `userId`, más recientes primero. Sin gate de rol: cada uno lee las suyas. */
export async function listNotificationsForUser(db: Db, userId: string): Promise<DbNotification[]> {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt))
}

/** Marca como leídas todas las notificaciones no leídas de `userId`; devuelve el número de filas afectadas. */
export async function markAllReadForUser(db: Db, userId: string): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning()

  return result.length
}

/** Número de notificaciones no leídas de `userId`. */
export async function unreadCountForUser(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))

  return row?.total ?? 0
}

/**
 * Todas las notificaciones enviadas, con el nombre del estudiante destinatario (join
 * con `users`); `[]` si `mentorId` no es mentor. Modelo de mentor único: todas las
 * notificaciones existentes fueron enviadas por el mentor, así que no hace falta
 * filtrar por remitente (la tabla no tiene esa columna) — igual que `listStudents`
 * lista a todos los estudiantes sin distinguir "quién los invitó".
 */
export async function listSentNotifications(db: Db, mentorId: string): Promise<(DbNotification & { studentName: string })[]> {
  if (!(await isMentor(db, mentorId))) return []

  const rows = await db
    .select({ notification: notifications, studentName: users.name })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .orderBy(desc(notifications.createdAt))

  return rows.map((r) => ({ ...r.notification, studentName: r.studentName }))
}
