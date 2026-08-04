import { signedMoney } from '@/lib/format'

/** Barras verticales de rendimiento mensual (últimos 8 meses). Ver mockup líneas 154-162, 652-657. */
export function MonthlyBars({ months }: { months: { label: string; net: number }[] }) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.net)))

  return (
    <div className="flex h-[130px] items-end gap-[9px]">
      {months.map((m, i) => {
        const positive = m.net >= 0
        const height = Math.max(6, (Math.abs(m.net) / max) * 88)
        const background = positive
          ? 'linear-gradient(180deg, var(--color-accent), var(--color-accent-700))'
          : 'linear-gradient(180deg, var(--neg), color-mix(in oklab, var(--neg) 40%, transparent))'

        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]">
            <span className="text-[10px] text-neutral-500 tabular-nums">{signedMoney(m.net)}</span>
            <div
              className="w-full rounded-[4px] transition-[height] duration-300 ease-in-out"
              style={{ height: `${height}px`, background }}
            />
            <span className="text-[10px] text-neutral-500">{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}
