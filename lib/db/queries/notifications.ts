import { and, count, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm'
import { APP_UTC_OFFSET } from '@/lib/app-time'
import { notifications, trades, users, type DbNotification } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'
import { isMentor, isStudent } from '@/lib/db/queries/mentor'
import type { FeedbackFormValues } from '@/lib/validation/mentor'

/** `opts.limit` por defecto para `listNotificationsForUser`/`listSentNotifications`
 * (smoke-test de escala: 500+ estudiantes, 1000+ mensajes — sin paginación, cualquiera de
 * las dos listas completas sería una respuesta enorme). `MAX_LIMIT` topa tanto un `limit`
 * hostil pasado directamente a la query como el `?limite=` de la URL de cada página (ver
 * `parseLimit` en cada `page.tsx`) — defensa en profundidad, esta capa no confía en que el
 * caller ya haya topado el valor. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

/** Entero positivo entre 1 y `MAX_LIMIT`; si falta o no tiene esa forma, `DEFAULT_LIMIT`. */
function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

/**
 * Condiciones de rango de fechas sobre `notifications.createdAt` para `desde`/`hasta`
 * ('YYYY-MM-DD', ya validados por el caller — ver `parseDateParam` en cada `page.tsx`; esta
 * capa no revalida el formato). `desde`/`hasta` faltantes no agregan condición (rango
 * abierto de ese lado).
 *
 * Los límites del día se anclan a la zona del programa (`APP_UTC_OFFSET`, ver
 * lib/app-time.ts) con un offset explícito en el string — NUNCA a la hora local del
 * proceso Node: la versión anterior parseaba 'T00:00:00' sin offset y en producción
 * (servidor en UTC) desplazaba el rango 6 horas, excluyendo los mensajes enviados por la
 * tarde/noche del día `hasta` (bug cazado por el usuario, ronda 13 del smoke-test).
 */
function dateRangeConditions(desde: string | undefined, hasta: string | undefined): SQL[] {
  const conditions: SQL[] = []
  if (desde) conditions.push(gte(notifications.createdAt, new Date(`${desde}T00:00:00${APP_UTC_OFFSET}`)))
  if (hasta) conditions.push(lte(notifications.createdAt, new Date(`${hasta}T23:59:59.999${APP_UTC_OFFSET}`)))
  return conditions
}

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

/** Notificación con el `tradeDate`/`asset` (nullable) del trade referenciado, si lo hay. */
export type NotificationWithTrade = DbNotification & { tradeDate: string | null; asset: string | null }

/** Filtros opcionales de `listNotificationsForUser`/`listSentNotifications` — `desde`/`hasta`
 * 'YYYY-MM-DD' (ver `dateRangeConditions`), `limit` (ver `normalizeLimit`). */
export type NotificationListOptions = { desde?: string; hasta?: string; limit?: number }

/** `hasMore`: `true` si existen más filas que las devueltas en `items` (más allá de
 * `limit`/`DEFAULT_LIMIT`) — pedir `limit + 1` filas y descartar la última es más simple y
 * barato que un `count()` aparte solo para saber si hay una página siguiente. */
export type NotificationListResult<T> = { items: T[]; hasMore: boolean }

/**
 * Notificaciones de `userId`, más recientes primero. Sin gate de rol: cada uno lee las
 * suyas. LEFT JOIN (no INNER) contra `trades` para traer `tradeDate`/`asset` junto con
 * cada notificación — la pantalla `/notificaciones` (Task 16) los necesita para el botón
 * 'Ver operación · {asset} · {fecha}' sin una consulta extra por fila. LEFT, no INNER,
 * porque `notifications.tradeId` es nullable (la mayoría de kinds no referencian un trade,
 * ver `feedbackSchema`) y además tiene `onDelete: 'set null'`: si el trade se borrara más
 * adelante, la notificación debe seguir apareciendo (sin el botón), no desaparecer de la
 * lista por culpa de un INNER JOIN.
 *
 * `opts.desde`/`opts.hasta`/`opts.limit` (smoke-test de escala): filtro de rango de fechas
 * (ver `dateRangeConditions`, incluye la nota de aproximación de zona horaria) + paginación
 * simple `limit`+1 (ver `NotificationListResult`). Sin `opts`, se comporta como antes salvo
 * el tope implícito de `DEFAULT_LIMIT` filas (antes devolvía la lista completa sin límite).
 */
export async function listNotificationsForUser(
  db: Db,
  userId: string,
  opts: NotificationListOptions = {},
): Promise<NotificationListResult<NotificationWithTrade>> {
  const limit = normalizeLimit(opts.limit)

  const rows = await db
    .select({ notification: notifications, tradeDate: trades.tradeDate, asset: trades.asset })
    .from(notifications)
    .leftJoin(trades, eq(notifications.tradeId, trades.id))
    .where(and(eq(notifications.userId, userId), ...dateRangeConditions(opts.desde, opts.hasta)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const items = rows
    .slice(0, limit)
    .map((r) => ({ ...r.notification, tradeDate: r.tradeDate ?? null, asset: r.asset ?? null }))

  return { items, hasMore }
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

/** Filtros de `listSentNotifications` — igual que `NotificationListOptions` más `studentId`
 * (destinatario exacto; sin este filtro, todos los estudiantes). */
export type SentNotificationListOptions = NotificationListOptions & { studentId?: string }

/**
 * Notificaciones enviadas, con el nombre del estudiante destinatario (join con `users`);
 * `{ items: [], hasMore: false }` si `mentorId` no es mentor. Modelo de mentor único: todas
 * las notificaciones existentes fueron enviadas por el mentor, así que no hace falta
 * filtrar por remitente (la tabla no tiene esa columna) — igual que `listStudents` lista a
 * todos los estudiantes sin distinguir "quién los invitó".
 *
 * `opts.studentId`/`opts.desde`/`opts.hasta`/`opts.limit` (smoke-test de escala): mismo
 * filtro de rango de fechas y paginación `limit`+1 que `listNotificationsForUser` (ver su
 * doc, incluida la nota de aproximación de zona horaria), más un filtro exacto por
 * destinatario. `studentId` NO se valida aquí (ni que tenga forma de UUID, ni que sea
 * estudiante) — un id con forma inválida o de un no-estudiante simplemente no calza con
 * ningún `notifications.userId` y la lista sale vacía; la validación de forma vive en la
 * página (`isValidUuid`, ver `app/(mentor)/mensajes/page.tsx`).
 */
export async function listSentNotifications(
  db: Db,
  mentorId: string,
  opts: SentNotificationListOptions = {},
): Promise<NotificationListResult<DbNotification & { studentName: string }>> {
  if (!(await isMentor(db, mentorId))) return { items: [], hasMore: false }

  const limit = normalizeLimit(opts.limit)
  const conditions: SQL[] = dateRangeConditions(opts.desde, opts.hasta)
  if (opts.studentId) conditions.push(eq(notifications.userId, opts.studentId))

  const rows = await db
    .select({ notification: notifications, studentName: users.name })
    .from(notifications)
    .innerJoin(users, eq(notifications.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map((r) => ({ ...r.notification, studentName: r.studentName }))

  return { items, hasMore }
}
