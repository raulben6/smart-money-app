import Link from 'next/link'
import type { DbTrade } from '@/lib/db/schema'
import { signedMoney, MONTH_NAMES_ES } from '@/lib/format'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
 * columnas (igual que el mockup, líneas 229-242). Cada celda con un solo
 * trade enlaza directo a `?trade=<id>`; con 2+ enlaza a `?dia=YYYY-MM-DD`
 * (abre `DayTradesPanel`, que lista todas las operaciones de ese día — sin
 * esto, un día con varios trades solo dejaba llegar al más antiguo por
 * `createdAt`); sin trades enlaza a `?nuevo=1&fecha=YYYY-MM-DD` — salvo en
 * modo `readOnly` (mentor, Task 12), donde una celda sin operaciones se
 * renderiza como un `<div>` no interactivo en vez de un `<Link>` (un mentor
 * no puede registrar operaciones a nombre de su alumno). `basePath` prefija
 * todos los enlaces ('/calendario' para el alumno, '/estudiantes/[id]/calendario'
 * para el mentor). Lógica de tinte/borde por signo replicada del mockup
 * (líneas 668-688).
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
  basePath,
  readOnly,
}: {
  year: number
  month: number
  days: Map<number, DayAggregate>
  trades: DbTrade[]
  basePath: string
  readOnly: boolean
}) {
  const firstIds = firstTradeIdByDay(trades, year, month)
  const daysInMonth = new Date(year, month, 0).getDate()
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const monthNameLower = MONTH_NAMES_ES[month - 1].toLowerCase()

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
        .cal-day-static:hover { border-color: var(--color-neutral-800); transform: none; }
        .cal-amt { font-family: var(--font-heading); font-weight: 500; font-size: 15px; }
        /* Fase 3 responsive: a <640px la celda mide ~41px; con padding de 10px y
           monto a 15px el número se salía del borde. Compactar, no desbordar. */
        @media (max-width: 639.9px) {
          .cal-day { padding: 5px 4px; gap: 2px; border-radius: 8px; }
          .cal-amt { font-size: 10px; letter-spacing: -0.02em; }
        }
      `}</style>

      <div className="grid grid-cols-7 gap-1 sm:gap-[7px]">
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

          const className = [
            'cal-day',
            !has && readOnly ? 'cal-day-static' : '',
            'min-h-[52px]',
            'sm:min-h-[92px]',
            has ? (positive ? 'cal-day-pos' : 'cal-day-neg') : '',
          ]
            .filter(Boolean)
            .join(' ')

          const daySpan = <span className="text-[11.5px] text-neutral-400 tabular-nums">{day}</span>

          // Sin operaciones y modo mentor (readOnly): celda no interactiva, sin `?nuevo=` —
          // un mentor no registra operaciones a nombre de su alumno.
          if (!has && readOnly) {
            return (
              <div key={day} className={className} aria-label={`${day} de ${monthNameLower}, sin operaciones`}>
                {daySpan}
              </div>
            )
          }

          const href =
            count > 1
              ? `${basePath}?y=${year}&m=${month}&dia=${dateStr}`
              : has && firstId
                ? `${basePath}?y=${year}&m=${month}&trade=${firstId}`
                : `${basePath}?y=${year}&m=${month}&nuevo=1&fecha=${dateStr}`

          const ariaLabel =
            count > 1
              ? `${day} de ${monthNameLower}, ${signedMoney(pnl)}, ${count} ${tradeWord(count)} — ver lista`
              : has
                ? `${day} de ${monthNameLower}, ${signedMoney(pnl)}, ${count} ${tradeWord(count)}`
                : `${day} de ${monthNameLower}, sin operaciones, registrar`

          return (
            <Link key={day} href={href} aria-label={ariaLabel} className={className}>
              {daySpan}
              {has ? (
                <>
                  <span
                    className="cal-amt tabular-nums"
                    style={{ color: positive ? 'var(--pos)' : 'var(--neg)' }}
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
