import { eq } from 'drizzle-orm'
import { users } from '@/lib/db/schema'
import type { Db } from '@/lib/db/queries/trades'
import { listTrades } from '@/lib/db/queries/trades'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { insertLevelUpNotification } from '@/lib/db/queries/notifications'
import { computeLevelStatus, type LevelStatus } from '@/lib/metrics/levels'

/**
 * Detección de ascensos de nivel (ronda 16): el nivel es SIEMPRE derivado
 * (nunca almacenado), así que el "evento" de superar un nivel solo puede
 * observarse comparando el estado ANTES y DESPUÉS de una mutación que lo
 * afecte (guardar/editar/borrar un trade, otorgar el desbloqueo manual).
 *
 * Uso en las actions: `before = await levelSnapshot(db, userId)` antes de
 * mutar, y `await notifyNewLevelUps(db, userId, before)` después — este último
 * recalcula el estado fresco, felicita (con dedupe, ver
 * `insertLevelUpNotification`) cada nivel recién completado, y NUNCA lanza:
 * un fallo aquí no debe romper la mutación que ya se aplicó (best-effort,
 * mismo criterio que el borrado de blobs en removeTrade).
 *
 * La asignación manual del mentor NO pasa por aquí a propósito: colocar a un
 * estudiante en un nivel es una decisión administrativa, no un logro que
 * felicitar (y `assignStudentLevel` no llama a este helper).
 */
export async function levelSnapshot(db: Db, userId: string): Promise<LevelStatus | null> {
  // Best-effort también AQUÍ (fix del revisor): un fallo del snapshot previo
  // jamás debe abortar la mutación principal (guardar/borrar el trade) — sin
  // snapshot simplemente no se felicita en esta pasada.
  try {
    const [row] = await db.select().from(users).where(eq(users.id, userId))
    if (!row || row.initialBalance === null) return null

    const [trades, levels, grantedLevelIds] = await Promise.all([
      listTrades(db, userId),
      listLevels(db),
      listGrantIdsForUser(db, userId),
    ])

    return computeLevelStatus({
      trades,
      initialBalance: row.initialBalance,
      levels,
      grantedLevelIds,
      startPosition: row.startLevelPosition,
      baselineNet: row.levelBaselineNet,
    })
  } catch (err) {
    console.error('[levelSnapshot]', err)
    return null
  }
}

/** Compara con el estado actual y felicita los niveles recién completados. Devuelve cuántos insertó. */
export async function notifyNewLevelUps(db: Db, userId: string, before: LevelStatus | null): Promise<number> {
  if (before === null) return 0

  try {
    const after = await levelSnapshot(db, userId)
    if (after === null) return 0

    const completedBefore = new Set(
      before.perLevel.filter((p) => p.state === 'completado').map((p) => p.level.id),
    )
    const newlyCompleted = after.perLevel.filter(
      (p) => p.state === 'completado' && !completedBefore.has(p.level.id),
    )

    let inserted = 0
    for (const { level } of newlyCompleted) {
      if (await insertLevelUpNotification(db, userId, level)) inserted += 1
    }
    return inserted
  } catch (err) {
    console.error('[notifyNewLevelUps]', err)
    return 0
  }
}
