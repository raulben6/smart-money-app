import { signedMoney } from '@/lib/format'

const GRID_Y = [20, 65, 110, 155, 200]

/**
 * Curva de crecimiento (últimos 30 días). SVG viewBox 0 0 720 220, per mockup
 * líneas 109-124. `areaPath`/`linePath` ya vienen calculados por la página con
 * `buildLinePath(equityPoints(...).map(p => p.balance), 720, 220)`.
 */
export function EquityCurve({
  areaPath,
  linePath,
  ticks,
  periodNet,
}: {
  areaPath: string
  linePath: string
  ticks: [string, string, string]
  periodNet: number
}) {
  const positive = periodNet >= 0

  return (
    <div className="card" style={{ padding: '18px 20px', gap: '14px' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="whitespace-nowrap" style={{ margin: 0, fontSize: '14px' }}>Curva de crecimiento</h2>
        <span className="text-[11.5px] text-neutral-500">Últimos 30 días de operativa</span>
        <span className={`ml-auto whitespace-nowrap text-[12px] tabular-nums ${positive ? 'text-pos' : 'text-neg'}`}>
          {signedMoney(periodNet)} en el periodo
        </span>
      </div>

      <svg
        viewBox="0 0 720 220"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Curva de crecimiento de los últimos 30 días, resultado ${signedMoney(periodNet)}`}
        style={{ width: '100%', height: '220px', display: 'block' }}
      >
        <defs>
          <linearGradient id="sm-dashboard-equity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {GRID_Y.map((y) => (
          <line key={y} x1={0} x2={720} y1={y} y2={y} stroke="var(--color-neutral-800)" strokeWidth={1} />
        ))}
        <path d={areaPath} fill="url(#sm-dashboard-equity)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ strokeDasharray: 1400, animation: 'smDraw 1.1s ease-out both' }}
        />
      </svg>

      <div className="flex justify-between text-[10.5px] text-neutral-500">
        {ticks.map((tick, i) => (
          <span key={i}>{tick}</span>
        ))}
      </div>
    </div>
  )
}
