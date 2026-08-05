import { notFound } from 'next/navigation'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { isValidUuid } from '@/lib/validation/uuid'
import { listTradesForStudent, listStudents, getStudentById } from '@/lib/db/queries/mentor'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { StudentPicker } from '@/components/shell/StudentPicker'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Dashboard de un alumno concreto visto por su mentor — mismo `DashboardView` que
 * `/dashboard` (Task 12), montado en `readOnly` para que el mentor vea exactamente el mismo
 * detalle que ve el alumno. Ruta fijada por la resolución del controlador (ledger F2-T12):
 * `/estudiantes/[id]/dashboard`.
 */
export default async function StudentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ trade?: string; nuevo?: string; fecha?: string }>
}) {
  const mentor = await requireMentor()
  const { id } = await params
  if (!isValidUuid(id)) notFound()

  const db = getDb()
  const [student, trades, students] = await Promise.all([
    getStudentById(db, mentor.id, id),
    listTradesForStudent(db, mentor.id, id),
    listStudents(db, mentor.id),
  ])
  if (!student) notFound()

  const resolvedSearchParams = await searchParams

  return (
    <>
      <DashboardView
        trades={trades}
        // Un alumno que nunca terminó el onboarding tiene `initialBalance` null — se muestra
        // un dashboard en cero en vez de romper (decisión del controlador, F2-T12).
        initialBalance={student.initialBalance ?? 0}
        displayName={student.name}
        readOnly
        basePath={`/estudiantes/${id}/dashboard`}
        headerActions={
          <StudentPicker
            // Solo id+nombre — nunca la fila completa (clerkId/role/initialBalance/createdAt no
            // deben viajar al navegador del mentor en el payload RSC de otros alumnos).
            students={students.map((s) => ({ id: s.id, name: s.name }))}
            currentId={id}
            subroute="dashboard"
          />
        }
      />

      <TradeModalGate searchParams={resolvedSearchParams} viewer={{ mode: 'mentor', studentId: id }} />
    </>
  )
}
