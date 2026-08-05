import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { listStudents } from '@/lib/db/queries/mentor'
import { PageHeader } from '@/components/shell/PageHeader'
import { StudentPicker } from '@/components/shell/StudentPicker'
import { LevelEditor } from '@/components/mentor/LevelEditor'

/**
 * Administración de niveles del mentor (Task 15): editor de los 5 niveles del programa
 * (`LevelEditor`) + sección de desbloqueo manual para el alumno seleccionado en `?e=<id>`
 * (mismo patrón de selección por query param que `/objetivos-estudiantes`, Task 14 — esta
 * pantalla tampoco tiene una subruta propia por alumno).
 */
export default async function NivelesPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const mentor = await requireMentor()
  const db = getDb()

  const [levels, students] = await Promise.all([listLevels(db), listStudents(db, mentor.id)])

  const { e } = await searchParams
  const hasStudents = students.length > 0
  const studentId = hasStudents ? (e && students.some((s) => s.id === e) ? e : students[0]!.id) : null

  const grantedLevelIds = studentId ? await listGrantIdsForUser(db, studentId) : []

  return (
    <>
      <PageHeader title="Niveles del programa" subtitle="Configura los niveles y sus requisitos">
        {hasStudents && studentId ? (
          <StudentPicker
            // Solo id+nombre — nunca la fila completa (clerkId/role/initialBalance/createdAt
            // no deben viajar al navegador del mentor en el payload RSC de otros alumnos).
            students={students.map((s) => ({ id: s.id, name: s.name }))}
            currentId={studentId}
            hrefFor={(id) => `/niveles?e=${id}`}
          />
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        <LevelEditor levels={levels} studentId={studentId} grantedLevelIds={grantedLevelIds} hasStudents={hasStudents} />
      </div>
    </>
  )
}
