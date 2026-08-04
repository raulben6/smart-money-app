import type { Summary } from '@/lib/metrics/types'
import { money } from '@/lib/format'

/** Lista de calidad de la operativa (debajo del donut). Ver mockup líneas 140-147, 643-649. */
export function QualityStats({ summary }: { summary: Summary }) {
  const rows: { label: string; value: string; colorClassName?: string }[] = [
    {
      label: 'Ratio R:B promedio',
      value: summary.rbRatio === null ? '—' : `1 : ${summary.rbRatio.toFixed(2)}`,
    },
    {
      label: 'Promedio de ganancia',
      value: summary.avgWin === null ? '—' : money(summary.avgWin),
      colorClassName: 'text-pos',
    },
    {
      label: 'Promedio de pérdida',
      value: summary.avgLoss === null ? '—' : `-${money(summary.avgLoss)}`,
      colorClassName: 'text-neg',
    },
    {
      label: 'Mejor trade',
      value: summary.bestTrade === null ? '—' : money(summary.bestTrade),
      colorClassName: 'text-pos',
    },
    {
      label: 'Peor trade',
      value: summary.worstTrade === null ? '—' : money(summary.worstTrade),
      colorClassName: 'text-neg',
    },
  ]

  return (
    <div className="flex flex-col gap-[9px] border-t border-neutral-800 pt-[14px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-[10px] text-[12px]">
          <span className="text-neutral-400">{row.label}</span>
          <span className={`ml-auto tabular-nums ${row.colorClassName ?? 'text-text'}`}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}
