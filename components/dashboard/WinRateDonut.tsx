import { pct } from '@/lib/format'

/** Donut de win rate. Dos círculos r=42, stroke-width 9, rotado -90°. Ver mockup líneas 130-138. */
export function WinRateDonut({ winRate, wins, losses }: { winRate: number | null; wins: number; losses: number }) {
  const rounded = winRate === null ? 0 : Math.round(winRate)
  const dash = (rounded / 100) * 264

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Win Rate ${rounded} por ciento`}
        style={{ width: '96px', height: '96px', flex: 'none', transform: 'rotate(-90deg)' }}
      >
        <circle cx={50} cy={50} r={42} fill="none" stroke="var(--color-neutral-800)" strokeWidth={9} />
        <circle
          cx={50}
          cy={50}
          r={42}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${dash} 264`}
        />
      </svg>
      <div className="flex flex-col gap-[3px]">
        <span className="text-[28px] leading-none tabular-nums" style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}>
          {winRate === null ? '—' : pct(rounded)}
        </span>
        <span className="text-[11.5px] text-neutral-400">Win Rate</span>
        <span className="mt-[6px] text-[11.5px] text-neutral-500">
          {wins} ganadoras · {losses} perdedoras
        </span>
      </div>
    </div>
  )
}
