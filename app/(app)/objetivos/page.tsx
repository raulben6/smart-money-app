import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { listGoalsForUser } from '@/lib/db/queries/goals'
import { computeGoalProgress } from '@/lib/metrics/goals'
import { todayLocalISO } from '@/lib/format'
import { PageHeader } from '@/components/shell/PageHeader'
import { GoalCard, formatGoalProgress } from '@/components/goals/GoalCard'

/**
 * Objetivos del propio estudiante (Task 14, mockup 279-306): grid de `GoalCard` de solo
 * lectura (`editable={false}` — sin botón Editar, esa acción es exclusiva del mentor en
 * `/objetivos-estudiantes`). El progreso se calcula server-side con los trades reales del
 * alumno (`computeGoalProgress`), nunca se confía en un valor guardado.
 */
export default async function ObjetivosPage() {
  const user = await requireUser()
  const db = getDb()

  const [goals, trades] = await Promise.all([listGoalsForUser(db, user.id), listTrades(db, user.id)])

  const today = todayLocalISO()

  return (
    <>
      <PageHeader title="Objetivos" subtitle="Lo que tu mentor definió para ti este ciclo" />

      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        {goals.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Tu mentor aún no te asigna objetivos</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Cuando lo haga, verás aquí tu progreso calculado en tiempo real a partir de tus operaciones.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[14px]">
            {goals.map((goal) => {
              const progress = computeGoalProgress(goal, trades, today)
              const { currentDisplay, targetDisplay } = formatGoalProgress(goal.kind, progress.current, goal.targetValue)
              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  status={progress.status}
                  progressPct={progress.pct}
                  currentDisplay={currentDisplay}
                  targetDisplay={targetDisplay}
                  editable={false}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
