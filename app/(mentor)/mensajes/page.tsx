import { PageHeader } from '@/components/shell/PageHeader'
import { ComingSoonCard } from '@/components/shell/ComingSoonCard'

/** Placeholder — un task posterior lo reemplaza con el listado real de mensajes enviados. */
export default function MensajesPage() {
  return (
    <>
      <PageHeader title="Mensajes enviados" subtitle="Retroalimentación que le has dejado a tus estudiantes" />
      <ComingSoonCard />
    </>
  )
}
