import Link from 'next/link'
import { money, pct } from '@/lib/format'
import type { StudentStats } from '@/lib/mentor-stats'

/**
 * Tabla de ranking de `/panel` (mockup líneas 358-375): #, Estudiante, Nivel, Balance,
 * Win Rate, Profit Factor, Drawdown, botón "Abrir". Ordenada por rentabilidad (`ret`)
 * descendente — NO por balance ni por el orden de `stats` que recibe (el de
 * `listStudents`). Ruta del botón fijada por la resolución del controlador (ledger
 * F2-T12): `/estudiantes/[id]/dashboard`.
 */
export function RankingTable({ stats }: { stats: StudentStats[] }) {
  const ranked = [...stats].sort((a, b) => b.ret - a.ret)

  return (
    <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
      <h2 style={{ margin: 0, fontSize: '14px' }}>Ranking de estudiantes</h2>

      <div className="overflow-x-auto">
        <table className="table min-w-[640px]" style={{ width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>
              <th scope="col" className="text-left">#</th>
              <th scope="col" className="text-left">Estudiante</th>
              <th scope="col" className="text-left">Nivel</th>
              <th scope="col" className="text-right">Balance</th>
              <th scope="col" className="text-right">Win Rate</th>
              <th scope="col" className="text-right">Profit Factor</th>
              <th scope="col" className="text-right">Drawdown</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => {
              // El balance se colorea por el signo de la RENTABILIDAD (no del balance en
              // sí) — así lo hace el mockup (línea 367: `s.color = s.ret >= 0 ? text : NEG`).
              const balanceColor = s.ret >= 0 ? 'var(--color-text)' : 'var(--neg)'

              return (
                <tr key={s.student.id}>
                  <td style={{ color: 'var(--color-neutral-500)' }}>{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    {/* Enlace con color heredado (mismo patrón que RecentTrades): en móvil
                        el botón "Abrir" queda tras el scroll horizontal — el nombre siempre
                        visible también abre al alumno. */}
                    <Link
                      href={`/estudiantes/${s.student.id}/dashboard`}
                      style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
                    >
                      {s.student.name}
                    </Link>
                  </td>
                  <td>
                    <span className="tag tag-outline whitespace-nowrap" style={{ fontSize: '10px' }}>
                      {s.levelName}
                    </span>
                  </td>
                  <td className="text-right tabular-nums" style={{ color: balanceColor }}>
                    {money(s.summary.balance)}
                  </td>
                  <td className="text-right tabular-nums">{s.summary.winRate === null ? '—' : pct(s.summary.winRate, 0)}</td>
                  <td className="text-right tabular-nums">
                    {/* PF null es ambiguo: "sin trades" (sin dato) o "récord perfecto, cero
                        pérdidas" (StudentStats.pfInfinite) — ver mismo comentario en CompareBars. */}
                    {s.summary.profitFactor !== null ? s.summary.profitFactor.toFixed(2) : s.pfInfinite ? '∞' : '—'}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--neg)' }}>
                    {pct(-s.dd, 1)}
                  </td>
                  <td className="text-right">
                    <Link href={`/estudiantes/${s.student.id}/dashboard`} className="btn btn-ghost" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
