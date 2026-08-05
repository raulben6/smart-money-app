import { PageHeader } from '@/components/shell/PageHeader'
import { ComingSoonCard } from '@/components/shell/ComingSoonCard'

/** Placeholder — un task posterior lo reemplaza con los objetivos reales del estudiante. */
export default function ObjetivosPage() {
  return (
    <>
      <PageHeader title="Objetivos" subtitle="Lo que tu mentor definió para ti este ciclo" />
      <ComingSoonCard />
    </>
  )
}
