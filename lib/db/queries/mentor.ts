import { and, desc, eq, isNull } from 'drizzle-orm'
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
  // Un estudiante ARCHIVADO (ronda 17) deja de ser destino válido: este único
  // gate saca a los dados de baja de todas las escrituras y lecturas del
  // mentor (feedback, goals, grants, asignación de nivel, vistas por alumno).
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'student'), isNull(users.archivedAt)))
    .limit(1)
  return rows.length > 0
}

/** Lista los estudiantes ACTIVOS (role='student', sin archivar); `[]` si `mentorId` no es un mentor. */
export async function listStudents(db: Db, mentorId: string): Promise<DbUser[]> {
  if (!(await isMentor(db, mentorId))) return []

  return db
    .select()
    .from(users)
    .where(and(eq(users.role, 'student'), isNull(users.archivedAt)))
    .orderBy(users.createdAt)
}

/**
 * Un estudiante concreto por id (Task 12 — páginas `/estudiantes/[id]/...`); `null` si
 * `mentorId` no es mentor o si `studentId` no corresponde a un estudiante existente. A
 * diferencia del resto de este módulo, no reusa `isStudent` como chequeo aparte: al
 * consultar directamente sobre `users` (la misma tabla que `isStudent` mira), basta con
 * combinar `id`+`role='student'` en un único WHERE — una sola consulta en vez de dos.
 */
export async function getStudentById(db: Db, mentorId: string, studentId: string): Promise<DbUser | null> {
  if (!(await isMentor(db, mentorId))) return null

  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, 'student'), isNull(users.archivedAt)))

  return row ?? null
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

/**
 * Asignación manual de nivel (ronda 16): fija el nivel inicial del estudiante
 * (`startLevelPosition`) y el baseline de dinero (`levelBaselineNet` = su netPnl
 * al momento de asignar — el nivel asignado arranca desde cero, ver
 * computeLevelStatus). `false` si `mentorId` no es mentor o si el destinatario
 * no es un estudiante (el `eq(users.role, 'student')` del WHERE hace imposible
 * tocar la fila de un mentor aunque el chequeo previo se saltara — defensa en
 * profundidad, misma doble capa que el resto del módulo).
 */
/**
 * Baja del programa (ronda 17): archiva a un estudiante ACTIVO — fuera del
 * panel, comparador, métricas y de todo gate `isStudent`; sus datos se
 * preservan para el historial y para la reconexión si el correo regresa
 * (`relinkUserByEmail`). `null` si `mentorId` no es mentor o si el destino no
 * es un estudiante activo (doble gate en el WHERE, como todo el módulo). El
 * caller (action) es responsable de revocar el acceso en Clerk ANTES.
 */
export async function archiveStudentById(db: Db, mentorId: string, studentId: string): Promise<DbUser | null> {
  if (!(await isMentor(db, mentorId))) return null

  const [row] = await db
    .update(users)
    .set({ archivedAt: new Date() })
    .where(and(eq(users.id, studentId), eq(users.role, 'student'), isNull(users.archivedAt)))
    .returning()

  return row ?? null
}

export async function setStudentStartLevel(
  db: Db,
  mentorId: string,
  studentId: string,
  startLevelPosition: number,
  levelBaselineNet: number,
): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false

  const updated = await db
    .update(users)
    .set({ startLevelPosition, levelBaselineNet })
    // isNull(archivedAt): un archivado no es destino válido (auditoría final —
    // sin este gate, asignarle nivel escribiría un baseline 0 corrupto porque
    // listTradesForStudent sí filtra archivados y devolvería []).
    .where(and(eq(users.id, studentId), eq(users.role, 'student'), isNull(users.archivedAt)))
    .returning({ id: users.id })

  return updated.length > 0
}
