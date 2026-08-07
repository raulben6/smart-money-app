import Link from 'next/link'
// Subpath `/dist/ssr` (no el paquete raíz que usa el resto del shell, ver `Sidebar.tsx`/
// `BottomNav.tsx`): esos son componentes `'use client'`, pero esta card se renderiza desde
// un server component (`/notificaciones`, `/mensajes`) y no necesita ningún JS de cliente
// — el subpath SSR de Phosphor está pensado exactamente para eso (íconos estáticos sin
// contexto de React ni hooks). `type Icon` sí se importa del paquete raíz: es un import
// SOLO de tipo (se borra en la compilación), así que no arrastra runtime de cliente.
import { Medal, PencilSimple, ListChecks, Info, TrendUp } from '@phosphor-icons/react/dist/ssr'
import type { Icon } from '@phosphor-icons/react'
import type { DbNotification } from '@/lib/db/schema'
import { relativeTime, formatDayMonth } from '@/lib/format'

/**
 * Notificación tal como la devuelve `listNotificationsForUser` (que sí trae `tradeDate`/
 * `asset` vía LEFT JOIN, ver `lib/db/queries/notifications.ts`) o `listSentNotifications`
 * (que NO los trae — decisión deliberada, ver doc del botón 'Ver operación' más abajo).
 * `tradeDate`/`asset` opcionales (no `| null` a secas) para que ambas formas encajen sin
 * un adaptador: ausentes por completo en la segunda, en vez de presentes-pero-`null`.
 */
export type NotificationCardData = {
  id: string
  kind: DbNotification['kind']
  title: string
  body: string
  createdAt: Date | string
  tradeId: string | null
  tradeDate?: string | null
  asset?: string | null
}

/** Icono + etiqueta por `kind` (mockup 774-780, iconos Phosphor asignados por el brief de Task 16). */
const KIND_META: Record<DbNotification['kind'], { Icon: Icon; label: string }> = {
  felicitacion: { Icon: Medal, label: 'Felicitación' },
  correccion: { Icon: PencilSimple, label: 'Corrección' },
  recordatorio: { Icon: ListChecks, label: 'Recordatorio' },
  observacion: { Icon: Info, label: 'Observación' },
  progreso: { Icon: TrendUp, label: 'Progreso' },
}

/** `/calendario?y=&m=&trade=` del trade referenciado — mismo criterio de `DayTradesPanel`:
 * año/mes se derivan de `tradeDate` (split('-'), nunca `new Date(str)`) en vez de recibirlos
 * como props redundantes. `month` es 1-12 (mismo formato que `resolveYearMonth` en `CalendarView`). */
function tradeHref(tradeDate: string, tradeId: string): string {
  const [year, month] = tradeDate.split('-').map(Number)
  return `/calendario?y=${year}&m=${month}&trade=${tradeId}`
}

/**
 * Card de notificación (mockup 254-276): icono circular por `kind`, título, tag outline con
 * la etiqueta del kind, tiempo relativo a la derecha, cuerpo, y — si la notificación
 * referencia un trade Y trae `tradeDate` (ver `NotificationCardData`) — un botón ghost
 * 'Ver operación · {asset} · {fecha}' que abre ese trade en `/calendario` (la ruta del
 * PROPIO alumno, `(app)/calendario`, gateada por `requireUser()`).
 *
 * Por eso `/mensajes` (vista del mentor, `listSentNotifications`) NUNCA muestra ese botón:
 * esa consulta no hace el join con `trades` (`tradeDate` queda `undefined`) porque
 * `/calendario` es la ruta del ALUMNO — un mentor navegando ahí vería su propio calendario
 * vacío (0 trades, es mentor), no el del alumno. Enlazar correctamente requeriría
 * `/estudiantes/[id]/calendario`, fuera del alcance resuelto para esta Task 16 (el brief
 * solo pide 'lista de listSentNotifications con nombre del alumno', sin ese botón).
 *
 * `studentName`: solo lo pasa `/mensajes` (vista del mentor, Task 16) — añade la línea
 * 'Para {nombre}' que el centro de notificaciones del estudiante no necesita (ahí todas
 * las notificaciones son, por definición, para el usuario que las está viendo).
 *
 * `unread` decide el acento visual (borde izquierdo, mockup: siempre presente ahí porque esa
 * captura no modela el estado leído/no leído) — aquí se reserva para la sección 'Nuevas' de
 * `/notificaciones`; `/mensajes` (sin concepto de leído para el remitente) siempre pasa `false`.
 */
export function NotificationCard({
  notification,
  now,
  unread,
  studentName,
}: {
  notification: NotificationCardData
  now: Date
  unread: boolean
  studentName?: string
}) {
  const { Icon, label } = KIND_META[notification.kind]
  // Variables locales (no `notification.tradeId`/`notification.tradeDate` inline en el
  // JSX) para que TS estreche `tradeDate` a `string` dentro de la rama verdadera del `&&`.
  const { tradeId, tradeDate } = notification

  return (
    <div
      className="card"
      style={{
        padding: '15px 17px',
        borderLeft: `2px solid ${unread ? 'var(--color-accent)' : 'transparent'}`,
      }}
    >
      <div className="flex items-start gap-[13px]">
        <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
          <Icon size={15} aria-hidden />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <div className="flex flex-wrap items-baseline gap-[10px]">
            <span className="text-[13px] font-medium">{notification.title}</span>
            <span className="tag tag-outline" style={{ fontSize: '10px' }}>
              {label}
            </span>
            <span className="ml-auto text-[11px] text-neutral-500">{relativeTime(notification.createdAt, now)}</span>
          </div>

          {studentName ? <span className="text-[11px] text-neutral-500">Para {studentName}</span> : null}

          <p className="m-0 text-[12.5px] leading-[1.55] text-neutral-300" style={{ textWrap: 'pretty' }}>
            {notification.body}
          </p>

          {tradeId && tradeDate ? (
            <Link
              href={tradeHref(tradeDate, tradeId)}
              className="btn btn-ghost self-start"
              style={{ fontSize: '11.5px', padding: '5px 9px', marginTop: '2px' }}
            >
              Ver operación · {notification.asset} · {formatDayMonth(tradeDate)}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
