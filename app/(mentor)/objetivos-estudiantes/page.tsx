import { PageHeader } from '@/components/shell/PageHeader'
import { ComingSoonCard } from '@/components/shell/ComingSoonCard'

/**
 * Placeholder — un task posterior lo reemplaza con la gestión real de objetivos.
 * Ruta `/objetivos-estudiantes` (no `/objetivos`, que ya usa el grupo `(app)` del
 * estudiante — Next.js no permite la misma ruta en dos grupos). Ver Task 11 report.
 */
export default function ObjetivosEstudiantesPage() {
  return (
    <>
      <PageHeader title="Objetivos" subtitle="Asigna y da seguimiento a los objetivos del estudiante" />
      <ComingSoonCard />
    </>
  )
}
