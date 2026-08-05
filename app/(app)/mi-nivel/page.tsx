import { PageHeader } from '@/components/shell/PageHeader'
import { ComingSoonCard } from '@/components/shell/ComingSoonCard'

/** Placeholder — un task posterior lo reemplaza con el progreso real por niveles. */
export default function MiNivelPage() {
  return (
    <>
      <PageHeader title="Mi progreso por niveles" subtitle="Cada nivel se desbloquea con resultados, no con tiempo" />
      <ComingSoonCard />
    </>
  )
}
