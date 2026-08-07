import { money, pct } from '@/lib/format'
import type { StudentStats } from '@/lib/mentor-stats'

type MetricDef = {
  label: string
  hint: string
  get: (s: StudentStats) => number | null
  format: (v: number) => string
  /**
   * Solo se consulta cuando `get(s)` es `null`: por default eso significa "sin dato"
   * (barra mínima 3% + '—'). Profit Factor la usa para el caso de PF infinito
   * (`StudentStats.pfInfinite`) — ningún estudiante con récord perfecto (cero pérdidas)
   * debe verse igual que uno que simplemente no ha operado; es el MEJOR resultado
   * posible, así que se pinta como el máximo de la fila (barra completa), no como el
   * mínimo. Devuelve `null` para caer al comportamiento default.
   */
  onNull?: (s: StudentStats) => { text: string; widthPct: number } | null
}

/**
 * Las 8 métricas del mockup (líneas 731-740) MENOS "Consistencia" (línea 737): ese
 * campo es `x/100` de "regularidad de resultados" sobre datos de la maqueta que no
 * tienen equivalente en nuestro modelo (no calculamos una puntuación de regularidad en
 * ningún `lib/metrics/*`) — se omite en vez de inventar una fórmula no pedida por el
 * controlador. Quedan 7 métricas, mismos labels/formatos/hints que el mockup.
 */
const METRIC_DEFS: MetricDef[] = [
  { label: 'Balance', hint: 'mayor es mejor', get: (s) => s.summary.balance, format: (v) => money(v) },
  {
    label: 'Profit Factor',
    hint: 'meta > 2.00',
    get: (s) => s.summary.profitFactor,
    format: (v) => v.toFixed(2),
    onNull: (s) => (s.pfInfinite ? { text: '∞', widthPct: 100 } : null),
  },
  { label: 'Win Rate', hint: 'contexto: depende del R:B', get: (s) => s.summary.winRate, format: (v) => pct(v, 0) },
  // dd ya es positivo (magnitud de la caída) — se muestra con signo negativo, pero la
  // barra es proporcional al valor tal cual (menor dd -> barra más corta), igual que el mockup.
  { label: 'Drawdown máximo', hint: 'menor es mejor', get: (s) => s.dd, format: (v) => pct(-v, 1) },
  { label: 'Rentabilidad', hint: 'sobre el capital inicial', get: (s) => s.ret, format: (v) => `${v.toFixed(1)}%` },
  { label: 'Riesgo promedio', hint: 'por operación', get: (s) => s.avgRiskPct, format: (v) => `${v.toFixed(1)}%` },
  { label: 'Operaciones', hint: 'volumen del periodo', get: (s) => s.summary.total, format: (v) => String(v) },
]

/** Primer nombre, igual que el mockup (`s.name.split(' ')[0]`) — las etiquetas de fila son angostas (96px). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * Filas de barras de `/comparador` (mockup líneas 386-402): una fila por métrica, una
 * barra por estudiante seleccionado. El ancho de cada barra es relativo al máximo entre
 * los seleccionados para esa métrica (mínimo 3% para que nunca desaparezca del todo,
 * igual que el mockup línea 839). Un valor `null` sin `onNull` (p.ej. Riesgo promedio sin
 * ningún trade con `riskPct`, u Operaciones/Balance que nunca son null) cuenta como 0 para
 * el ancho y se muestra como '—' — "sin dato". Profit Factor es la EXCEPCIÓN: un `null`
 * ahí puede significar "sin trades" (sin dato, igual que las demás) O "récord perfecto,
 * cero pérdidas" (`StudentStats.pfInfinite`) — el MEJOR resultado posible, que su
 * `onNull` pinta como '∞' con barra completa en vez de como si no hubiera dato.
 */
export function CompareBars({ stats }: { stats: StudentStats[] }) {
  return (
    <div className="card" style={{ padding: '20px 22px', gap: '18px' }}>
      {METRIC_DEFS.map((def) => {
        const values = stats.map((s) => def.get(s))
        const maxv = Math.max(...values.map((v) => v ?? 0), 0.0001)

        return (
          <div key={def.label} className="flex flex-col gap-[9px]">
            <div className="flex items-baseline">
              <span className="text-[12px] text-neutral-300">{def.label}</span>
              <span className="ml-auto text-[11px] text-neutral-500">{def.hint}</span>
            </div>

            {stats.map((s, i) => {
              const v = values[i]
              const nullOverride = v === null ? (def.onNull?.(s) ?? null) : null
              const widthPct = v === null ? (nullOverride?.widthPct ?? 3) : Math.max(3, (v / maxv) * 100)
              const valueText = v === null ? (nullOverride?.text ?? '—') : def.format(v)

              return (
                <div key={s.student.id} className="flex items-center gap-[11px]">
                  <span className="w-[96px] flex-none truncate text-[11.5px] text-neutral-400">{firstName(s.student.name)}</span>
                  <div className="h-[8px] flex-1 overflow-hidden rounded-[5px]" style={{ background: 'var(--color-neutral-800)' }}>
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        borderRadius: '5px',
                        background: 'linear-gradient(90deg, var(--color-accent-700), var(--color-accent))',
                        transition: 'width .45s ease',
                      }}
                    />
                  </div>
                  <span className="w-[64px] text-right text-[11.5px] tabular-nums">{valueText}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
