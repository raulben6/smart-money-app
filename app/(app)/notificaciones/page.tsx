import { PageHeader } from '@/components/shell/PageHeader'
import { ComingSoonCard } from '@/components/shell/ComingSoonCard'

/** Placeholder — un task posterior lo reemplaza con el centro real de notificaciones. */
export default function NotificacionesPage() {
  return (
    <>
      <PageHeader title="Centro de notificaciones" subtitle="Retroalimentación y observaciones de tu mentor" />
      <ComingSoonCard />
    </>
  )
}
