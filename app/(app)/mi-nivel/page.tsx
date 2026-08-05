import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeLevelStatus } from '@/lib/metrics/levels'
import { PageHeader } from '@/components/shell/PageHeader'
import { LevelProgressCard } from '@/components/levels/LevelProgressCard'
import { LevelCarousel } from '@/components/levels/LevelCarousel'

/**
 * Progreso por niveles del propio estudiante (Task 15, mockup 308-344): `LevelProgressCard`
 * (nivel en curso, grande) + `LevelCarousel` (los 5 niveles). El estado se calcula
 * server-side con las operaciones reales del alumno (`computeLevelStatus`), nunca con un
 * valor guardado — mismo criterio que `/objetivos` (Task 14) y `loadStudentStats` (mentor).
 */
export default async function MiNivelPage() {
  const user = await requireUser()
  const db = getDb()

  const [trades, levels, grantedLevelIds] = await Promise.all([
    listTrades(db, user.id),
    listLevels(db),
    listGrantIdsForUser(db, user.id),
  ])

  const status = computeLevelStatus({ trades, initialBalance: user.initialBalance ?? 0, levels, grantedLevelIds })

  return (
    <>
      <PageHeader title="Mi progreso por niveles" subtitle="Cada nivel se desbloquea con resultados, no con tiempo" />

      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        <LevelProgressCard status={status} />
        <LevelCarousel status={status} />
      </div>
    </>
  )
}
