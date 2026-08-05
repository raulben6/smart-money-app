import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DbTrade } from '@/lib/db/schema'
import { calendarAggregates } from '@/lib/metrics/periods'
import { MONTH_NAMES_ES } from '@/lib/format'
import { PageHeader } from '@/components/shell/PageHeader'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { MonthSummary } from '@/components/calendar/MonthSummary'
import { DayTradesPanel } from '@/components/calendar/DayTradesPanel'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Año/mes válidos desde `searchParams` (enteros, año 2000-2100, mes 1-12); si faltan o son inválidos, el mes actual local. */
function resolveYearMonth(y: string | undefined, m: string | undefined): { year: number; month: number } {
  const now = new Date()
  const year = Number(y)
  const month = Number(m)
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12

  return {
    year: validYear ? year : now.getFullYear(),
    month: validMonth ? month : now.getMonth() + 1,
  }
}

/** Mes/año desplazados `delta` meses (±1), con acarreo de año. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/**
 * Cuerpo de `/calendario` (Fase 1), extraído a un componente compartido para que el mentor
 * pueda ver exactamente el mismo calendario, en modo solo lectura, de cualquier alumno
 * (Task 12 de Fase 2 — ver `app/(mentor)/estudiantes/[id]/calendario/page.tsx`).
 *
 * `y`/`m` llegan tal cual de `searchParams` (strings sin validar, ver `resolveYearMonth`).
 * `searchParams` trae el resto de query params relevantes para esta vista: `trade`/`nuevo`
 * deciden si el panel de día (`DayTradesPanel`) debe ceder ante el modal de trade (mismo
 * criterio de exclusión mutua que la página de Fase 1); `dia` abre ese panel. El modal en sí
 * (`TradeModalGate`) NO se monta aquí — lo monta la página (server component con el `viewer`
 * resuelto), como hermano de esta vista.
 *
 * `readOnly` oculta las entradas de creación ('+ Registrar trade' del header, '+ Registrar
 * en este día' del panel) y vuelve no interactivas las celdas de día sin operaciones (ver
 * `MonthGrid`). `basePath` alimenta TODOS los enlaces internos (`?dia=`, `?trade=`,
 * `?nuevo=`, mes anterior/siguiente) para que funcionen igual bajo `/calendario` (alumno)
 * que bajo `/estudiantes/[id]/calendario` (mentor). `headerActions` es el hueco donde la
 * página mentor monta `StudentPicker` (Task 12) — `undefined` en las páginas de alumno, sin
 * efecto visual.
 */
export function CalendarView({
  trades,
  y,
  m,
  searchParams,
  readOnly,
  basePath,
  headerActions,
}: {
  trades: DbTrade[]
  y?: string
  m?: string
  searchParams: { trade?: string; nuevo?: string; fecha?: string; dia?: string }
  readOnly: boolean
  basePath: string
  headerActions?: ReactNode
}) {
  const { trade, nuevo, dia } = searchParams
  const { year, month } = resolveYearMonth(y, m)
  const { days, summary } = calendarAggregates(trades, year, month)

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const monthLabel = `${MONTH_NAMES_ES[month - 1]} ${year}`

  // `?dia=` abre el panel de lista (DayTradesPanel) en vez del modal de trade — mutuamente
  // excluyentes con `trade`/`nuevo`: si cualquiera de esos dos está activo, gana el modal
  // (montado por la página, ver doc de arriba) y el panel no se renderiza, aunque `dia`
  // también venga en la URL.
  const diaValida = dia && FECHA_RE.test(dia) ? dia : null
  const showDayPanel = diaValida !== null && !trade && !nuevo
  const dayTrades = showDayPanel ? trades.filter((t) => t.tradeDate === diaValida) : []

  const subtitle = readOnly
    ? 'Revisa cada día operado y deja retroalimentación'
    : 'Haz clic en un día para registrar o revisar tus operaciones'

  return (
    <>
      <PageHeader title="Calendario de trading" subtitle={subtitle}>
        {headerActions}
        {!readOnly && (
          <Link href={`${basePath}?y=${year}&m=${month}&nuevo=1`} className="btn btn-secondary">
            + Registrar trade
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        <div className="flex flex-wrap items-center gap-[14px]">
          <div className="flex items-center gap-[8px]">
            <Link
              href={`${basePath}?y=${prev.year}&m=${prev.month}`}
              aria-label="Mes anterior"
              className="btn btn-ghost btn-icon"
              style={{ width: '30px', height: '30px' }}
            >
              ‹
            </Link>
            <span
              className="min-w-[150px] text-center text-[15px]"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
            >
              {monthLabel}
            </span>
            <Link
              href={`${basePath}?y=${next.year}&m=${next.month}`}
              aria-label="Mes siguiente"
              className="btn btn-ghost btn-icon"
              style={{ width: '30px', height: '30px' }}
            >
              ›
            </Link>
          </div>

          <div className="ml-auto hidden gap-4 text-[11.5px] text-neutral-400 sm:flex">
            <span className="flex items-center gap-[6px]">
              <i
                style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--pos)', display: 'block' }}
              />
              Día positivo
            </span>
            <span className="flex items-center gap-[6px]">
              <i
                style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--neg)', display: 'block' }}
              />
              Día negativo
            </span>
            <span className="flex items-center gap-[6px]">
              <i
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: 'var(--color-neutral-700)',
                  display: 'block',
                }}
              />
              Sin operativa
            </span>
          </div>
        </div>

        <MonthGrid year={year} month={month} days={days} trades={trades} basePath={basePath} readOnly={readOnly} />

        <MonthSummary summary={summary} />
      </div>

      {showDayPanel && diaValida !== null ? (
        <DayTradesPanel
          dateISO={diaValida}
          trades={dayTrades}
          basePath={basePath}
          closeHref={`${basePath}?y=${year}&m=${month}`}
          registerHref={readOnly ? undefined : `${basePath}?y=${year}&m=${month}&nuevo=1&fecha=${diaValida}`}
        />
      ) : null}
    </>
  )
}
