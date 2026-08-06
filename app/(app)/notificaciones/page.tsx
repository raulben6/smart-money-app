import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listNotificationsForUser } from '@/lib/db/queries/notifications'
import { PageHeader } from '@/components/shell/PageHeader'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { MarkAsRead } from '@/components/notifications/MarkAsRead'

const SECTION_TITLE_CLASS = 'm-0 text-[11px] tracking-[0.13em] uppercase text-neutral-500'

/**
 * Centro de notificaciones del estudiante (Task 16, mockup 254-276): retroalimentación que
 * su mentor le deja, opcionalmente ligada a un trade concreto. Se separa en 'Nuevas'
 * (`readAt === null`) y 'Anteriores' ANTES de montar `MarkAsRead` (que las marca todas como
 * leídas al llegar el navegador) — así el usuario alcanza a ver cuáles eran nuevas en esta
 * misma visita; se apagan a partir de la siguiente.
 */
export default async function NotificacionesPage() {
  const user = await requireUser()
  const db = getDb()

  const notifications = await listNotificationsForUser(db, user.id)
  const now = new Date()

  const nuevas = notifications.filter((n) => n.readAt === null)
  const anteriores = notifications.filter((n) => n.readAt !== null)

  return (
    <>
      <PageHeader title="Centro de notificaciones" subtitle="Retroalimentación y observaciones de tu mentor" />

      <div className="flex flex-col gap-[26px] px-[30px] pt-[26px] pb-[60px]">
        {notifications.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no tienes notificaciones</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Cuando tu mentor te deje retroalimentación sobre una operación, aparecerá aquí.
            </p>
          </div>
        ) : (
          <>
            {nuevas.length > 0 && (
              <section className="flex flex-col gap-[10px]">
                <h2 className={SECTION_TITLE_CLASS}>Nuevas</h2>
                <div className="flex flex-col gap-[10px]" style={{ maxWidth: '840px' }}>
                  {nuevas.map((n) => (
                    <NotificationCard key={n.id} notification={n} now={now} unread />
                  ))}
                </div>
              </section>
            )}

            {anteriores.length > 0 && (
              <section className="flex flex-col gap-[10px]">
                <h2 className={SECTION_TITLE_CLASS}>Anteriores</h2>
                <div className="flex flex-col gap-[10px]" style={{ maxWidth: '840px' }}>
                  {anteriores.map((n) => (
                    <NotificationCard key={n.id} notification={n} now={now} unread={false} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <MarkAsRead />
    </>
  )
}
