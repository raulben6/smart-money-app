import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listNotificationsForUser } from '@/lib/db/queries/notifications'
import { PageHeader } from '@/components/shell/PageHeader'
import { NotificationCard } from '@/components/notifications/NotificationCard'
import { MarkAsRead } from '@/components/notifications/MarkAsRead'

const SECTION_TITLE_CLASS = 'm-0 text-[11px] tracking-[0.13em] uppercase text-neutral-500'
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const PAGE_SIZE = 50
const MAX_LIMIT = 500

function parseFecha(value: string | undefined): string | undefined {
  return value && FECHA_RE.test(value) ? value : undefined
}

/** Mismo criterio que `parseLimite` de `/mensajes` — ver su doc. */
function parseLimite(value: string | undefined): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return PAGE_SIZE
  return Math.min(n, MAX_LIMIT)
}

/**
 * Centro de notificaciones del estudiante (Task 16, mockup 254-276, + smoke-test de
 * escala): retroalimentación que su mentor le deja, opcionalmente ligada a un trade
 * concreto. Se separa en 'Nuevas' (`readAt === null`) y 'Anteriores' ANTES de montar
 * `MarkAsRead` (que las marca todas como leídas al llegar el navegador) — así el usuario
 * alcanza a ver cuáles eran nuevas en esta misma visita; se apagan a partir de la
 * siguiente. La separación aplica sobre el conjunto YA FILTRADO por `desde`/`hasta`.
 *
 * Filtro de fecha vía un `<form method="GET">` NATIVO (mismo patrón sin-JS que
 * `/mensajes`, ver su doc) — `desde`/`hasta` se validan aquí (regex de fecha) antes de
 * pasarlos a `listNotificationsForUser`.
 *
 * `MarkAsRead` se monta SIEMPRE, sin importar los filtros vigentes: marca como leídas
 * TODAS las notificaciones del usuario (no solo las que calzan con el filtro actual) — el
 * estado leído/no leído es una propiedad global de la notificación, no algo que dependa
 * de qué recorte esté viendo el usuario en un momento dado.
 */
export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; limite?: string }>
}) {
  const user = await requireUser()
  const db = getDb()

  const { desde: desdeRaw, hasta: hastaRaw, limite: limiteRaw } = await searchParams
  const desde = parseFecha(desdeRaw)
  const hasta = parseFecha(hastaRaw)
  const limit = parseLimite(limiteRaw)

  const { items: notifications, hasMore } = await listNotificationsForUser(db, user.id, { desde, hasta, limit })
  const now = new Date()

  const nuevas = notifications.filter((n) => n.readAt === null)
  const anteriores = notifications.filter((n) => n.readAt !== null)

  const filterParams = new URLSearchParams()
  if (desde) filterParams.set('desde', desde)
  if (hasta) filterParams.set('hasta', hasta)

  const cargarMasParams = new URLSearchParams(filterParams)
  cargarMasParams.set('limite', String(Math.min(limit + PAGE_SIZE, MAX_LIMIT)))
  const cargarMasHref = `/notificaciones?${cargarMasParams.toString()}`

  const hayFiltros = Boolean(desde || hasta)

  return (
    <>
      <PageHeader title="Centro de notificaciones" subtitle="Retroalimentación y observaciones de tu mentor" />

      <div className="flex flex-col gap-[18px] px-[30px] pt-[26px] pb-[60px]">
        <form
          method="GET"
          className="card flex flex-wrap items-end gap-[12px]"
          style={{ padding: '16px 18px', maxWidth: '840px' }}
        >
          <div className="field">
            <label htmlFor="notif-desde">Desde</label>
            <input id="notif-desde" type="date" name="desde" className="input" defaultValue={desde ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="notif-hasta">Hasta</label>
            <input id="notif-hasta" type="date" name="hasta" className="input" defaultValue={hasta ?? ''} />
          </div>
          <button type="submit" className="btn btn-secondary text-[12px]">
            Filtrar
          </button>
          <Link href="/notificaciones" className="btn btn-ghost text-[12px]">
            Limpiar
          </Link>
        </form>

        {notifications.length === 0 ? (
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px', maxWidth: '840px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>
              {hayFiltros ? 'No hay notificaciones en ese rango de fechas' : 'Aún no tienes notificaciones'}
            </h2>
            <p className="m-0 text-[13px] text-neutral-400">
              {hayFiltros
                ? 'Prueba con otro rango de fechas, o usa "Limpiar" para ver todas.'
                : 'Cuando tu mentor te deje retroalimentación sobre una operación, aparecerá aquí.'}
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

            {hasMore && (
              <Link href={cargarMasHref} className="btn btn-ghost self-start text-[12px]">
                Cargar más
              </Link>
            )}
          </>
        )}
      </div>

      <MarkAsRead />
    </>
  )
}
