import type { CalendarAggregates } from '@/lib/metrics/periods'
import { signedMoney } from '@/lib/format'

type Summary = CalendarAggregates['summary']

/**
 * 4 tarjetas de resumen del mes: Resultado del mes, Días operados, Días
 * positivos y Mejor día. Ver mockup líneas 244-251, 692-697.
 *
 * "Mejor día" y "Resultado del mes" se colorean por signo real (`--pos`/
 * `--neg`), no con el verde fijo que usa el mockup para ambos — un mes o un
 * "mejor día" puede ser negativo (p.ej. una cuenta perdedora), y pintarlo en
 * verde sería incorrecto. "Días positivos" sí usa `--pos` fijo (como el
 * mockup): es un conteo, no un signo.
 */
export function MonthSummary({ summary }: { summary: Summary }) {
  const netColor = summary.net >= 0 ? 'var(--pos)' : 'var(--neg)'
  const bestDayColor =
    summary.bestDay === null ? 'var(--color-neutral-400)' : summary.bestDay >= 0 ? 'var(--pos)' : 'var(--neg)'

  const cards = [
    { label: 'Resultado del mes', value: signedMoney(summary.net), color: netColor },
    { label: 'Días operados', value: String(summary.daysTraded), color: 'var(--color-text)' },
    { label: 'Días positivos', value: `${summary.positiveDays} de ${summary.daysTraded}`, color: 'var(--pos)' },
    { label: 'Mejor día', value: summary.bestDay === null ? '—' : signedMoney(summary.bestDay), color: bestDayColor },
  ]

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      {cards.map((c) => (
        <div key={c.label} className="card" style={{ padding: '14px 16px', gap: '6px' }}>
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-neutral-500">{c.label}</span>
          <span
            className="tabular-nums"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: '20px', color: c.color }}
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  )
}
