import { and, desc, eq } from 'drizzle-orm'
import {
  users,
  trades,
  tradeJournals,
  tradeCaptures,
  type DbUser,
  type DbTrade,
  type DbJournal,
  type DbCapture,
} from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'

/**
 * Verifica DENTRO de la capa de datos (defensa en profundidad, independiente del
 * `requireMentor()` de la capa de acciones) que `userId` corresponde a un usuario
 * existente con `role = 'mentor'`. Toda función de este módulo (y de `goals.ts`,
 * `levels.ts`, `notifications.ts`, que importan este helper) hace este chequeo como
 * primer paso antes de tocar cualquier tabla. Se exporta para que las demás queries
 * de la capa de mentor reutilicen exactamente la misma comprobación en vez de
 * duplicarla (un único punto de verdad, más fácil de auditar).
 */
export async function isMentor(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'mentor')))
    .limit(1)
  return rows.length > 0
}

/**
 * Verifica que `userId` corresponde a un usuario existente con `role = 'student'`.
 * Se usa para validar el "target" de las operaciones que un mentor ejerce sobre un
 * estudiante concreto (p.ej. `listTradesForStudent`, `insertGoal`, `insertNotification`),
 * de forma que un mentorId válido nunca pueda apuntar a otro mentor o a un id
 * inexistente y colarse como si fuera un estudiante.
 */
export async function isStudent(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'student')))
    .limit(1)
  return rows.length > 0
}

/** Lista todos los estudiantes (role='student'); `[]` si `mentorId` no es un mentor. */
export async function listStudents(db: Db, mentorId: string): Promise<DbUser[]> {
  if (!(await isMentor(db, mentorId))) return []

  return db.select().from(users).where(eq(users.role, 'student')).orderBy(users.createdAt)
}

/**
 * Trades de `studentId`, más recientes primero (mismo orden que `listTrades`);
 * `[]` si `mentorId` no es mentor o si `studentId` no es un estudiante (no permite
 * que el mentor "vea" los trades de otro mentor pasando su id como studentId).
 */
export async function listTradesForStudent(db: Db, mentorId: string, studentId: string): Promise<DbTrade[]> {
  if (!(await isMentor(db, mentorId))) return []
  if (!(await isStudent(db, studentId))) return []

  return db
    .select()
    .from(trades)
    .where(eq(trades.userId, studentId))
    .orderBy(desc(trades.tradeDate), desc(trades.createdAt))
}

/**
 * Detalle de un trade de un estudiante concreto (misma forma que `getTradeDetail`);
 * `null` si `mentorId` no es mentor, si `studentId` no es estudiante, o si el trade
 * no existe o no pertenece exactamente a `studentId` (el mentor debe pasar el
 * `studentId` correcto — no basta con conocer el `tradeId` de cualquier estudiante).
 */
export async function getTradeDetailForStudent(
  db: Db,
  mentorId: string,
  studentId: string,
  tradeId: string,
): Promise<{ trade: DbTrade; journal: DbJournal | null; captures: DbCapture[] } | null> {
  if (!(await isMentor(db, mentorId))) return null
  if (!(await isStudent(db, studentId))) return null

  const [trade] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, studentId)))

  if (!trade) return null

  const [journal] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
  const captures = await db.select().from(tradeCaptures).where(eq(tradeCaptures.tradeId, tradeId))

  return { trade, journal: journal ?? null, captures }
}

/**
 * Captura de cualquier trade cuyo dueño sea un estudiante (join captures -> trades ->
 * users, exigiendo `users.role = 'student''); `null` si `mentorId` no es mentor o si
 * la captura no existe / su trade no pertenece a un estudiante. No recibe `studentId`:
 * el modelo es "el mentor puede ver la captura de cualquier estudiante", igual que
 * `listStudents` lista a todos.
 */
export async function getCaptureForStudent(db: Db, mentorId: string, captureId: string): Promise<DbCapture | null> {
  if (!(await isMentor(db, mentorId))) return null

  const [row] = await db
    .select({ capture: tradeCaptures })
    .from(tradeCaptures)
    .innerJoin(trades, eq(tradeCaptures.tradeId, trades.id))
    .innerJoin(users, eq(trades.userId, users.id))
    .where(and(eq(tradeCaptures.id, captureId), eq(users.role, 'student')))

  return row?.capture ?? null
}
