import type { Summary } from '@/lib/metrics/types'
import { money, signedMoney, pct } from '@/lib/format'

/** Tarjetas de métricas superiores del dashboard. Ver mockup líneas 92-100, 636-641. */
export function HeroStats({ summary, initialBalance }: { summary: Summary; initialBalance: number }) {
  const netPositive = summary.netPnl >= 0
  const pnlPct = (summary.netPnl / initialBalance) * 100

  const cards: { label: string; value: string; sub: string; colorClassName?: string }[] = [
    {
      label: 'Balance actual',
      value: money(summary.balance),
      sub: `Cuenta de ${money(initialBalance)}`,
    },
    {
      label: 'P&L acumulado',
      value: signedMoney(summary.netPnl),
      sub: `${pct(pnlPct, 2)} sobre la cuenta`,
      colorClassName: netPositive ? 'text-pos' : 'text-neg',
    },
    {
      label: 'Profit Factor',
      value: summary.profitFactor === null ? '—' : summary.profitFactor.toFixed(2),
      sub: 'Meta del nivel: 1.80',
    },
    {
      label: 'Expectancy',
      value: summary.expectancy === null ? '—' : `${money(summary.expectancy)} / trade`,
      sub: `${summary.total} operaciones este mes`,
    },
  ]

  return (
    // Columnas explícitas (fase 3 responsive): el auto-fit dejaba una tarjeta
    // huérfana (3+1) entre 640px y 1279px. 2×2 en tablet, 4 en escritorio ancho.
    <div className="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="card" style={{ padding: '16px 17px', gap: '9px' }}>
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-neutral-500">{card.label}</span>
          <span
            className={`text-[26px] leading-none tracking-[-0.02em] tabular-nums ${card.colorClassName ?? 'text-text'}`}
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
          >
            {card.value}
          </span>
          <span className="text-[11.5px] text-neutral-400">{card.sub}</span>
        </div>
      ))}
    </div>
  )
}
