import { cache } from 'react'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeLevelStatus, type LevelStatus } from '@/lib/metrics/levels'

/**
 * `LevelStatus` del propio estudiante (+ sus trades, que el fetch ya trae),
 * con caché por request via `React.cache`: el layout `(app)` (nivel en el pie
 * del sidebar) y las páginas que también lo calculan (`/calendario`,
 * `/mi-nivel`) comparten un único fetch cuando se renderizan en el mismo
 * request. Composición server-only de queries + métricas puras, mismo criterio
 * que `lib/mentor-stats.ts` (que resuelve lo equivalente para OTROS alumnos —
 * este helper es solo para el usuario de la sesión).
 */
export const getOwnLevelStatus = cache(
  async (userId: string, initialBalance: number, startPosition: number, baselineNet: number) => {
    const db = getDb()
    const [trades, levels, grantedLevelIds] = await Promise.all([
      listTrades(db, userId),
      listLevels(db),
      listGrantIdsForUser(db, userId),
    ])
    const status = computeLevelStatus({ trades, initialBalance, levels, grantedLevelIds, startPosition, baselineNet })
    return { trades, status }
  },
)

/**
 * Nombre del nivel EN CURSO para mostrar — misma regla de unificación que
 * `StudentStats.levelName` (ver lib/mentor-stats.ts): `next` es el nivel que se
 * está trabajando; si ya no hay siguiente, el último completado; `'—'` solo en
 * el caso degenerado sin niveles sembrados.
 */
export function levelDisplayName(status: LevelStatus): string {
  return status.next?.name ?? status.current?.name ?? '—'
}
