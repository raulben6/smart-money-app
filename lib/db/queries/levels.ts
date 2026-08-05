import { and, asc, eq } from 'drizzle-orm'
import { levels, manualLevelGrants, type DbLevel } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'
import { isMentor, isStudent } from '@/lib/db/queries/mentor'
import type { LevelFormValues } from '@/lib/validation/mentor'

/** Todos los niveles, ordenados por `position`. Lectura pública autenticada: no hay gate de rol. */
export async function listLevels(db: Db): Promise<DbLevel[]> {
  return db.select().from(levels).orderBy(asc(levels.position))
}

/**
 * Actualiza un nivel por id; `false` si `mentorId` no es mentor o el nivel no existe.
 * `id` se fija DESPUÉS del spread de `values` (aunque `LevelFormValues` no declara
 * `id`/`position`, esta función no depende de que el llamador respete ese tipo en
 * runtime): una clave `id` hostil dentro de `values` no debe poder reescribir la
 * clave primaria ni afectar a otra fila distinta de `levelId`.
 */
export async function updateLevelById(db: Db, mentorId: string, levelId: string, values: LevelFormValues): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false

  const result = await db
    .update(levels)
    .set({ ...values, updatedAt: new Date(), id: levelId })
    .where(eq(levels.id, levelId))
    .returning()

  return result.length > 0
}

/**
 * Otorga manualmente `levelId` a `studentId`; `false` si `mentorId` no es mentor o
 * `studentId` no es un estudiante existente. Idempotente vía `onConflictDoNothing`
 * sobre la PK compuesta (`userId`, `levelId`): otorgar el mismo nivel dos veces sigue
 * devolviendo `true` sin duplicar la fila.
 */
export async function grantLevel(db: Db, mentorId: string, studentId: string, levelId: string): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false
  if (!(await isStudent(db, studentId))) return false

  await db.insert(manualLevelGrants).values({ userId: studentId, levelId }).onConflictDoNothing()

  return true
}

/** Revoca un grant manual; `false` si `mentorId` no es mentor o el grant no existía. */
export async function revokeGrant(db: Db, mentorId: string, studentId: string, levelId: string): Promise<boolean> {
  if (!(await isMentor(db, mentorId))) return false

  const result = await db
    .delete(manualLevelGrants)
    .where(and(eq(manualLevelGrants.userId, studentId), eq(manualLevelGrants.levelId, levelId)))
    .returning()

  return result.length > 0
}

/** Ids de los niveles otorgados manualmente a `userId`. Sin gate de rol: cada uno lee los suyos. */
export async function listGrantIdsForUser(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ levelId: manualLevelGrants.levelId })
    .from(manualLevelGrants)
    .where(eq(manualLevelGrants.userId, userId))

  return rows.map((r) => r.levelId)
}
