import Link from 'next/link'
import type { DbTrade } from '@/lib/db/schema'
import { signedMoney } from '@/lib/format'

const LINK_STYLE = { display: 'block', color: 'inherit', textDecoration: 'none' } as const

/** Tabla de últimas operaciones. Cada celda enlaza a `/dashboard?trade=<id>` (Gate del Task 13). Ver mockup líneas 165-188, 659-666. */
export function RecentTrades({ trades }: { trades: DbTrade[] }) {
  return (
    <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
      <div className="flex items-baseline">
        <h2 style={{ margin: 0, fontSize: '14px' }}>Últimas operaciones</h2>
        <Link href="/calendario" className="btn btn-ghost ml-auto" style={{ fontSize: '11.5px', padding: '5px 9px' }}>
          Ver calendario
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="table" style={{ width: '100%', fontSize: '12px' }}>
          <thead>
            <tr>
              <th scope="col" className="text-left">Activo</th>
              <th scope="col" className="text-left">Dir.</th>
              <th scope="col" className="text-left">Setup</th>
              <th scope="col" className="text-right">R</th>
              <th scope="col" className="text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const positive = t.pnlUsd >= 0
              const isLong = t.direction === 'long'
              const pnlColor = positive ? 'var(--pos)' : 'var(--neg)'
              const dirColor = isLong ? 'var(--pos)' : 'var(--neg)'
              const dirBorder = `color-mix(in oklab, ${dirColor} 45%, transparent)`
              const href = `/dashboard?trade=${t.id}`

              return (
                <tr key={t.id}>
                  <td className="tabular-nums">
                    <Link href={href} style={LINK_STYLE}>
                      {t.asset}
                    </Link>
                  </td>
                  <td>
                    <Link href={href} style={LINK_STYLE}>
                      <span
                        className="text-[10.5px]"
                        style={{ padding: '2px 7px', borderRadius: '5px', border: `1px solid ${dirBorder}`, color: dirColor }}
                      >
                        {isLong ? 'Long' : 'Short'}
                      </span>
                    </Link>
                  </td>
                  <td style={{ color: 'var(--color-neutral-400)' }}>
                    <Link href={href} style={LINK_STYLE}>
                      {t.setup}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums" style={{ color: pnlColor }}>
                    <Link href={href} style={LINK_STYLE}>
                      {t.rMultiple === null ? '—' : `${t.rMultiple > 0 ? '+' : ''}${t.rMultiple.toFixed(1)}R`}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums" style={{ color: pnlColor }}>
                    <Link href={href} style={LINK_STYLE}>
                      {signedMoney(t.pnlUsd)}
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
