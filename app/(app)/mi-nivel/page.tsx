import { requireUser } from '@/lib/auth'
import { getOwnLevelStatus } from '@/lib/level-status'
import { PageHeader } from '@/components/shell/PageHeader'
import { LevelProgressCard } from '@/components/levels/LevelProgressCard'
import { LevelCarousel } from '@/components/levels/LevelCarousel'

/**
 * Progreso por niveles del propio estudiante (Task 15, mockup 308-344): `LevelProgressCard`
 * (nivel en curso, grande) + `LevelCarousel` (los 5 niveles). El estado se calcula
 * server-side con las operaciones reales del alumno (`getOwnLevelStatus`, compartido con el
 * layout y `/calendario` via React.cache), nunca con un valor guardado — mismo criterio que
 * `/objetivos` (Task 14) y `loadStudentStats` (mentor).
 */
export default async function MiNivelPage() {
  const user = await requireUser()
  const { status } = await getOwnLevelStatus(
    user.id,
    user.initialBalance ?? 0,
    user.startLevelPosition,
    user.levelBaselineNet,
  )

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
