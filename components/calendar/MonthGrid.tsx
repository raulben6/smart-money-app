import Link from 'next/link'
import type { DbTrade } from '@/lib/db/schema'
import { signedMoney } from '@/lib/format'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTH_NAMES_LOWER = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

type DayAggregate = { pnl: number; count: number }

/** '+$640' -> '+640' (celda compacta en móvil, sin el símbolo de moneda). */
function compactPnl(pnl: number): string {
  return signedMoney(pnl).replace('$', '')
}

function tradeWord(count: number): string {
  return count === 1 ? 'trade' : 'trades'
}

/**
 * Id del primer trade (por `createdAt` más antiguo) de cada día del mes/año
 * pedidos. `trades` es la lista completa del usuario (sin filtrar), igual que
 * la que recibe `calendarAggregates` para construir `days`.
 */
function firstTradeIdByDay(trades: DbTrade[], year: number, month: number): Map<number, string> {
  const earliest = new Map<number, { id: string; createdAt: Date }>()
  for (const t of trades) {
    const [y, m, day] = t.tradeDate.split('-').map(Number)
    if (y !== year || m !== month) continue
    const current = earliest.get(day)
    if (!current || t.createdAt < current.createdAt) {
      earliest.set(day, { id: t.id, createdAt: t.createdAt })
    }
  }
  const result = new Map<number, string>()
  for (const [day, v] of earliest) result.set(day, v.id)
  return result
}

/**
 * Grid mensual: cabecera Lun-Dom + celdas de día en un único grid de 7
 * columnas (igual que el mockup, líneas 229-242). Cada celda con trades
 * enlaza a `?trade=<id>` (el más antiguo por `createdAt` ese día); sin
 * trades enlaza a `?nuevo=1&fecha=YYYY-MM-DD`. Lógica de tinte/borde por
 * signo replicada del mockup (líneas 668-688).
 *
 * El hover (borde acento + `translateY(-1px)`) y las variantes de
 * color/tinte se resuelven con clases (`.cal-day*`) en un `<style>` propio
 * del componente: `nocturne.css` define `a { color: var(--color-accent) }`
 * sin capa, así que un color puesto inline en el `<Link>` nunca podría
 * cambiar en `:hover` (un `style` inline gana siempre a cualquier regla de
 * hoja de estilos, esté o no en capa). Usando selectores de clase evitamos
 * el problema y además ganan por especificidad a ese `a` sin capa.
 */
export function MonthGrid({
  year,
  month,
  days,
  trades,
}: {
  year: number
  month: number
  days: Map<number, DayAggregate>
  trades: DbTrade[]
}) {
  const firstIds = firstTradeIdByDay(trades, year, month)
  const daysInMonth = new Date(year, month, 0).getDate()
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const monthNameLower = MONTH_NAMES_LOWER[month - 1]

  return (
    <div>
      <style>{`
        .cal-day {
          display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
          padding: 9px 10px; border-radius: 10px; text-decoration: none; color: inherit;
          border: 1px solid var(--color-neutral-800); background: transparent;
          transition: transform .12s ease, border-color .12s ease;
        }
        .cal-day:hover { border-color: var(--color-accent); transform: translateY(-1px); }
        .cal-day-pos {
          border-color: color-mix(in oklab, var(--pos) 40%, transparent);
          background: color-mix(in oklab, var(--pos) 12%, transparent);
        }
        .cal-day-neg {
          border-color: color-mix(in oklab, var(--neg) 40%, transparent);
          background: color-mix(in oklab, var(--neg) 12%, transparent);
        }
      `}</style>

      <div className="grid grid-cols-7 gap-[7px]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pt-[2px] pb-[6px] text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            {w}
          </div>
        ))}

        {Array.from({ length: offset }, (_, i) => (
          <div key={`empty-${i}`} aria-hidden="true" className="min-h-[52px] sm:min-h-[92px]" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const agg = days.get(day)
          const has = agg !== undefined
          const pnl = agg?.pnl ?? 0
          const count = agg?.count ?? 0
          const positive = pnl >= 0
          const firstId = firstIds.get(day)
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

          const href =
            has && firstId
              ? `/calendario?y=${year}&m=${month}&trade=${firstId}`
              : `/calendario?y=${year}&m=${month}&nuevo=1&fecha=${dateStr}`

          const ariaLabel = has
            ? `${day} de ${monthNameLower}, ${signedMoney(pnl)}, ${count} ${tradeWord(count)}`
            : `${day} de ${monthNameLower}, sin operaciones, registrar`

          const className = [
            'cal-day',
            'min-h-[52px]',
            'sm:min-h-[92px]',
            has ? (positive ? 'cal-day-pos' : 'cal-day-neg') : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <Link key={day} href={href} aria-label={ariaLabel} className={className}>
              <span className="text-[11.5px] text-neutral-400 tabular-nums">{day}</span>
              {has ? (
                <>
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 500,
                      fontSize: '15px',
                      color: positive ? 'var(--pos)' : 'var(--neg)',
                    }}
                  >
                    <span className="hidden sm:inline">{signedMoney(pnl)}</span>
                    <span className="sm:hidden">{compactPnl(pnl)}</span>
                  </span>
                  <span className="hidden text-[10.5px] text-neutral-500 sm:inline">
                    {count} {tradeWord(count)}
                  </span>
                </>
              ) : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
