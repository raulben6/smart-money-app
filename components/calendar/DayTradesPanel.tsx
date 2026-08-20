import Link from 'next/link'
import type { DbTrade } from '@/lib/db/schema'
import { formatLongDate, signedMoney } from '@/lib/format'

/**
 * Panel de lista para un día con 2+ operaciones (`?dia=YYYY-MM-DD` en el calendario),
 * alternativa a abrir directamente el modal de trade cuando hay ambigüedad sobre cuál
 * mostrar (ver `MonthGrid`: celdas con `count === 1` siguen yendo directo a `?trade=`).
 *
 * Server component: sin JS no hay `onClick` en el backdrop ni `Escape` para cerrar — el
 * cierre es siempre por enlace (`closeHref` o navegar a cualquier fila/botón). Aceptable
 * para un panel de solo lectura que no retiene estado de formulario.
 *
 * `year`/`month` para los enlaces de fila se derivan de `dateISO` (que siempre cae dentro
 * del mes visible que generó este panel), evitando pasar `y`/`m` como props redundantes.
 * `basePath` prefija esos enlaces de fila ('/calendario' para el alumno,
 * '/estudiantes/[id]/calendario' para el mentor, Task 12). `registerHref` es opcional: la
 * vista mentor (`readOnly`) lo omite por completo para ocultar '+ Registrar en este día' —
 * un mentor no registra operaciones a nombre de su alumno.
 */
export function DayTradesPanel({
  dateISO,
  trades,
  closeHref,
  registerHref,
  basePath,
}: {
  dateISO: string
  trades: DbTrade[]
  closeHref: string
  registerHref?: string
  basePath: string
}) {
  const [year, month] = dateISO.split('-').map(Number)
  const netPnl = trades.reduce((sum, t) => sum + t.pnlUsd, 0)
  const netColor = netPnl >= 0 ? 'var(--pos)' : 'var(--neg)'
  const tradeWord = trades.length === 1 ? 'operación' : 'operaciones'

  return (
    <div className="dialog-backdrop">
      <style>{`
        .daytrades-row {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 8px; border-radius: 8px;
          text-decoration: none; color: inherit;
        }
        .daytrades-row:hover { background: var(--color-neutral-800); }
      `}</style>

      <div
        className="dialog elev-lg"
        role="dialog"
        aria-modal="true"
        aria-label={`Operaciones del ${formatLongDate(dateISO)}`}
        style={{ animation: 'smRise .22s ease both' }}
      >
        <div>
          <h2 className="dialog-title" style={{ margin: 0 }}>
            {formatLongDate(dateISO)}
          </h2>
          <p className="dialog-body" style={{ margin: '4px 0 0' }}>
            {trades.length} {tradeWord} · P&amp;L del día{' '}
            <span className="tabular-nums" style={{ color: netColor }}>
              {signedMoney(netPnl)}
            </span>
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '50vh', overflowY: 'auto' }}>
          {trades.map((t) => {
            const positive = t.pnlUsd >= 0
            const pnlColor = positive ? 'var(--pos)' : 'var(--neg)'
            const isLong = t.direction === 'long'
            const dirColor = isLong ? 'var(--pos)' : 'var(--neg)'
            const dirBorder = `color-mix(in oklab, ${dirColor} 45%, transparent)`

            return (
              <Link key={t.id} href={`${basePath}?y=${year}&m=${month}&trade=${t.id}`} className="daytrades-row">
                <span className="tabular-nums" style={{ fontWeight: 600, minWidth: '60px' }}>
                  {t.asset}
                </span>
                <span
                  className="text-[10.5px]"
                  style={{ padding: '2px 7px', borderRadius: '5px', border: `1px solid ${dirBorder}`, color: dirColor }}
                >
                  {isLong ? 'Long' : 'Short'}
                </span>
                {/* En <480px el setup se oculta: truncado a ~5 caracteres no aporta
                    y el P&L/R (lo importante) necesita el espacio. */}
                <span className="hidden min-[480px]:block truncate text-[12px] text-neutral-400" style={{ flex: 1, minWidth: 0 }}>
                  {t.setup}
                </span>
                <span className="min-[480px]:hidden" style={{ flex: 1 }} />
                <span className="tabular-nums text-[12px]" style={{ color: pnlColor, minWidth: '40px', textAlign: 'right' }}>
                  {t.rMultiple === null ? '—' : `${t.rMultiple > 0 ? '+' : ''}${t.rMultiple.toFixed(1)}R`}
                </span>
                <span className="tabular-nums" style={{ color: pnlColor, minWidth: '72px', textAlign: 'right' }}>
                  {signedMoney(t.pnlUsd)}
                </span>
              </Link>
            )
          })}
        </div>

        <div className="dialog-actions">
          {registerHref ? (
            <Link href={registerHref} className="btn btn-secondary">
              + Registrar en este día
            </Link>
          ) : null}
          <Link href={closeHref} className="btn btn-ghost">
            Cerrar
          </Link>
        </div>
      </div>
    </div>
  )
}
