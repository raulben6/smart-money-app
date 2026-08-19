import Link from 'next/link'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listStudents, listTradesForStudent } from '@/lib/db/queries/mentor'
import { listGoalsForStudent } from '@/lib/db/queries/goals'
import { computeGoalProgress } from '@/lib/metrics/goals'
import { todayAppISO } from '@/lib/app-time'
import { isValidUuid } from '@/lib/validation/uuid'
import { PageHeader } from '@/components/shell/PageHeader'
import { StudentPicker } from '@/components/shell/StudentPicker'
import { GoalCard, formatGoalProgress } from '@/components/goals/GoalCard'
import { GoalForm, type EditableGoal } from '@/components/mentor/GoalForm'

/**
 * Gestión de objetivos por alumno (Task 14, mockup 279-306). Ruta fijada por la
 * resolución del controlador (ledger F2-T11): `/objetivos-estudiantes`, NO `/objetivos`
 * (esa ya la usa el grupo `(app)` del estudiante — colisión de rutas entre grupos).
 *
 * Selección de alumno en `?e=<id>` (mismo `StudentPicker` de Task 12, generalizado con
 * `queryPath` — ver su doc) en vez de un segmento `[id]` de la URL, porque esta pantalla
 * no tiene una subruta propia por alumno como `/estudiantes/[id]/dashboard|calendario`.
 * `?nuevo=1` abre `GoalForm` en modo crear; `?editar=<goalId>` en modo editar (el goal
 * debe pertenecer al alumno actualmente seleccionado — si no, se ignora, mismo patrón
 * defensivo que `TradeModalGate` con un `?trade=` que no resuelve).
 */
export default async function ObjetivosEstudiantesPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; nuevo?: string; editar?: string }>
}) {
  const mentor = await requireMentor()
  const db = getDb()
  const students = await listStudents(db, mentor.id)

  if (students.length === 0) {
    return (
      <>
        <PageHeader title="Objetivos" subtitle="Asigna y da seguimiento a los objetivos del estudiante" />
        <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no tienes estudiantes</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Invita a tu primer estudiante para poder asignarle objetivos.
            </p>
            <Link href="/invitaciones" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Invitar estudiante
            </Link>
          </div>
        </div>
      </>
    )
  }

  const { e, nuevo, editar } = await searchParams
  const studentId = e && students.some((s) => s.id === e) ? e : students[0]!.id
  const student = students.find((s) => s.id === studentId)!

  const [goals, trades] = await Promise.all([
    listGoalsForStudent(db, mentor.id, studentId),
    listTradesForStudent(db, mentor.id, studentId),
  ])

  const today = todayAppISO()

  // Solo se abre el form de edición si `editar` resuelve a un objetivo REAL del alumno
  // seleccionado (nunca el de otro alumno, ni un id inexistente) — mismo patrón
  // defensivo que `TradeModalGate` con `?trade=`.
  const editingGoal = editar && isValidUuid(editar) ? goals.find((g) => g.id === editar) : undefined
  const editableGoal: EditableGoal | undefined = editingGoal
    ? {
        id: editingGoal.id,
        kind: editingGoal.kind,
        name: editingGoal.name,
        description: editingGoal.description,
        targetValue: editingGoal.targetValue,
        thresholdValue: editingGoal.thresholdValue,
        manualProgress: editingGoal.manualProgress,
        startDate: editingGoal.startDate,
        dueDate: editingGoal.dueDate,
      }
    : undefined

  return (
    <>
      <PageHeader title="Objetivos" subtitle="Asigna y da seguimiento a los objetivos del estudiante">
        <StudentPicker
          // Solo id+nombre — nunca la fila completa (clerkId/role/initialBalance/createdAt
          // no deben viajar al navegador del mentor en el payload RSC de otros alumnos).
          students={students.map((s) => ({ id: s.id, name: s.name }))}
          currentId={studentId}
          queryPath="/objetivos-estudiantes"
        />
        <Link href={`/objetivos-estudiantes?e=${studentId}&nuevo=1`} className="btn btn-primary" style={{ fontSize: '12px' }}>
          + Nuevo objetivo
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
        {goals.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>{student.name} aún no tiene objetivos</h2>
            <p className="m-0 text-[13px] text-neutral-400">Usa &quot;+ Nuevo objetivo&quot; para asignarle el primero.</p>
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
                  editable
                  editHref={`/objetivos-estudiantes?e=${studentId}&editar=${goal.id}`}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Prioridad edit > create si por algún motivo la URL trajera ambos params a la vez
          (mismo criterio que `TradeModalGate`, que resuelve `?trade=` antes que `?nuevo`) —
          nunca se apilan dos `GoalForm` a la vez. */}
      {editableGoal ? (
        <GoalForm key={editableGoal.id} mode="edit" goal={editableGoal} />
      ) : nuevo ? (
        // `key={studentId}`: si `studentId` cambia mientras `?nuevo=1` sigue en la URL (p.
        // ej. navegación de historial), fuerza a React a desmontar/remontar el form en vez
        // de reconciliar el mismo `GoalForm` y dejar su estado (`form`/`fieldErrors`)
        // pegado contra el alumno anterior — mismo criterio que `TradeModalGate` usa con
        // `key={plain.id}` al pasar de un `?trade=A` a `?trade=B`.
        <GoalForm key={studentId} mode="create" studentId={studentId} />
      ) : null}
    </>
  )
}
