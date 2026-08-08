import { notFound } from 'next/navigation'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { listTradesForStudent, listStudents, getStudentById } from '@/lib/db/queries/mentor'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeLevelStatus } from '@/lib/metrics/levels'
import { CalendarView } from '@/components/calendar/CalendarView'
import { StudentPicker } from '@/components/shell/StudentPicker'
import { StudentViewTabs } from '@/components/shell/StudentViewTabs'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Calendario de un alumno concreto visto por su mentor — mismo `CalendarView` que
 * `/calendario` (Task 12), montado en `readOnly` para que el mentor vea exactamente el mismo
 * detalle que ve el alumno. Ruta fijada por la resolución del controlador (ledger F2-T12):
 * `/estudiantes/[id]/calendario`.
 */
export default async function StudentCalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ y?: string; m?: string; trade?: string; nuevo?: string; fecha?: string; dia?: string }>
}) {
  const mentor = await requireMentor()
  const { id } = await params
  if (!isValidUuid(id)) notFound()

  const db = getDb()
  const [student, trades, students, levels, grantedLevelIds] = await Promise.all([
    getStudentById(db, mentor.id, id),
    listTradesForStudent(db, mentor.id, id),
    listStudents(db, mentor.id),
    listLevels(db),
    listGrantIdsForUser(db, id),
  ])
  if (!student) notFound()

  // Ronda 18 (pedido del usuario): el mentor también ve la barra de avance de
  // nivel sobre el calendario del alumno — mismo cálculo que las vistas del
  // estudiante, con su asignación manual y baseline (ronda 16).
  const levelStatus = computeLevelStatus({
    trades,
    initialBalance: student.initialBalance ?? 0,
    levels,
    grantedLevelIds,
    startPosition: student.startLevelPosition,
    baselineNet: student.levelBaselineNet,
  })

  const resolvedSearchParams = await searchParams
  const { y, m, trade, nuevo, fecha, dia } = resolvedSearchParams
  const basePath = `/estudiantes/${id}/calendario`

  return (
    <>
      <CalendarView
        trades={trades}
        y={y}
        m={m}
        searchParams={{ trade, nuevo, fecha, dia }}
        readOnly
        basePath={basePath}
        levelBanner={levelStatus}
        levelBannerLink={{ href: `/niveles?e=${id}`, label: 'Administrar nivel' }}
        headerActions={
          <>
            <StudentViewTabs studentId={id} active="calendario" />
            <StudentPicker
              // Solo id+nombre — nunca la fila completa (clerkId/role/initialBalance/createdAt
              // no deben viajar al navegador del mentor en el payload RSC de otros alumnos).
              students={students.map((s) => ({ id: s.id, name: s.name }))}
              currentId={id}
              subroute="calendario"
            />
          </>
        }
      />

      <TradeModalGate searchParams={{ trade, nuevo, fecha }} viewer={{ mode: 'mentor', studentId: id }} />
    </>
  )
}
