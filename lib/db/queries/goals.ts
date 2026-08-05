import { desc, eq } from 'drizzle-orm'
import { goals, type DbGoal } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'
import { isMentor, isStudent } from '@/lib/db/queries/mentor'
import type { GoalFormValues } from '@/lib/validation/mentor'

/** Objetivos propios del usuario (estudiante o mentor), más recientes primero. Sin gate de rol: cada uno ve solo lo suyo. */
export async function listGoalsForUser(db: Db, userId: string): Promise<DbGoal[]> {
  return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt))
}

/** Objetivos de `studentId` vistos por un mentor; `[]` si `mentorId` no es mentor o `studentId` no es estudiante. */
export async function listGoalsForStudent(db: Db, mentorId: string, studentId: string): Promise<DbGoal[]> {
  if (!(await isMentor(db, mentorId))) return []
  if (!(await isStudent(db, studentId))) return []

  return db.select().from(goals).where(eq(goals.userId, studentId)).orderBy(desc(goals.createdAt))
}

/**
 * Crea un objetivo para `studentId`; `null` si `mentorId` no es mentor o `studentId`
 * no es un estudiante existente (los estudiantes nunca crean objetivos, ni siquiera
 * los propios). `userId` se fija DESPUÉS del spread de `values` a propósito: aunque
 * `GoalFormValues` no declara un campo `userId`, esta función no debe depender de que
 * el llamador respete ese tipo en runtime — una clave `userId` hostil dentro de
 * `values` nunca debe poder redirigir el objetivo a otro estudiante.
 */
export async function insertGoal(db: Db, mentorId: string, studentId: string, values: GoalFormValues): Promise<string | null> {
  if (!(await isMentor(db, mentorId))) return null
  if (!(await isStudent(db, studentId))) return null

  const [row] = await db
    .insert(goals)
    .values({ ...values, userId: studentId })
    .returning()

  return row.id
}

/**
 * Actualiza un objetivo por id; `false` si `mentorId` no es mentor o el objetivo no
 * existe (modelo de mentor único: el mentor administra los objetivos de todos los
 * estudiantes, no hace falta que el llamador conozca de quién es). Se lee primero el
 * `userId` actual del objetivo y se vuelve a fijar tras el spread de `values` — junto
 * con `id` — para que una clave hostil `userId`/`id` dentro de `values` no pueda
 * reparentar el objetivo hacia otro estudiante ni reescribir su clave primaria.
 */
export async function updateGoalById(db: Db, mentorId: string, goalId: string, values: GoalFormValues): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false

  const [existing] = await db.select({ userId: goals.userId }).from(goals).where(eq(goals.id, goalId))
  if (!existing) return false

  const result = await db
    .update(goals)
    .set({ ...values, updatedAt: new Date(), userId: existing.userId, id: goalId })
    .where(eq(goals.id, goalId))
    .returning()

  return result.length > 0
}

/** Borra un objetivo por id; `false` si `mentorId` no es mentor o el objetivo no existe. */
export async function deleteGoalById(db: Db, mentorId: string, goalId: string): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false

  const result = await db.delete(goals).where(eq(goals.id, goalId)).returning()

  return result.length > 0
}
