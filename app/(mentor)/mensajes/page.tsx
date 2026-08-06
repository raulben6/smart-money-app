import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listSentNotifications } from '@/lib/db/queries/notifications'
import { PageHeader } from '@/components/shell/PageHeader'
import { NotificationCard } from '@/components/notifications/NotificationCard'

/**
 * Mensajes enviados por el mentor (Task 16): misma `NotificationCard` que el centro de
 * notificaciones del alumno, más la línea 'Para {nombre}' (prop `studentName`). Sin
 * `MarkAsRead` — el estado leído/no leído es del DESTINATARIO, no del remitente; esta
 * vista tampoco separa 'Nuevas'/'Anteriores' (ese concepto tampoco aplica al remitente).
 */
export default async function MensajesPage() {
  const mentor = await requireMentor()
  const db = getDb()

  const enviados = await listSentNotifications(db, mentor.id)
  const now = new Date()

  return (
    <>
      <PageHeader title="Mensajes enviados" subtitle="Retroalimentación que le has dejado a tus estudiantes" />

      <div className="flex flex-col gap-[10px] px-[30px] pt-[26px] pb-[60px]" style={{ maxWidth: '840px' }}>
        {enviados.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no le has enviado retroalimentación a nadie</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Abre una operación de un estudiante y usa &quot;Retroalimentación del mentor&quot; para dejarle la primera nota.
            </p>
          </div>
        ) : (
          enviados.map((n) => (
            <NotificationCard key={n.id} notification={n} now={now} unread={false} studentName={n.studentName} />
          ))
        )}
      </div>
    </>
  )
}
