import Link from 'next/link'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { loadStudentStats, resolveComparedIds } from '@/lib/mentor-stats'
import { PageHeader } from '@/components/shell/PageHeader'
import { CompareChips } from '@/components/mentor/CompareChips'
import { CompareBars } from '@/components/mentor/CompareBars'

/**
 * Comparador de estudiantes (Task 13 de Fase 2, mockup líneas 379-403): chips para
 * elegir a quién comparar + filas de barras con las métricas de la maqueta (líneas
 * 731-740, salvo "Consistencia" — ver comentario en `CompareBars`). El estado de
 * selección vive en la URL (`?s=id1,id2,...`), resuelto por `resolveComparedIds`
 * (resolución del controlador F2-T13) para que sea compartible y sobreviva a recargas.
 */
export default async function ComparadorPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const mentor = await requireMentor()
  const db = getDb()
  const stats = await loadStudentStats(db, mentor.id)

  if (stats.length === 0) {
    return (
      <>
        <PageHeader title="Comparador de estudiantes" subtitle="Selecciona a quién comparar y sobre qué métricas" />
        <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no tienes estudiantes</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Invita a tu primer estudiante para poder comparar su progreso aquí.
            </p>
            <Link href="/invitaciones" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Invitar estudiante
            </Link>
          </div>
        </div>
      </>
    )
  }

  const { s } = await searchParams
  const selectedIds = resolveComparedIds(stats, s)
  // Mismo orden que `stats` (el de `listStudents`), NO el de `selectedIds` — igual que
  // el mockup (`STUDENTS.filter(s => S.compare.includes(s.id))`, línea 730).
  const selectedStats = stats.filter((x) => selectedIds.includes(x.student.id))

  return (
    <>
      <PageHeader title="Comparador de estudiantes" subtitle="Selecciona a quién comparar y sobre qué métricas" />
      <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
        <CompareChips students={stats.map((x) => ({ id: x.student.id, name: x.student.name }))} selectedIds={selectedIds} />
        <CompareBars stats={selectedStats} />
      </div>
    </>
  )
}
