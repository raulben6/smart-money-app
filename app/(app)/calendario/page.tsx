import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeLevelStatus } from '@/lib/metrics/levels'
import { CalendarView } from '@/components/calendar/CalendarView'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Thin wrapper (Task 12): auth + fetch + `CalendarView`. El cuerpo real vive ahí — se
 * comparte con `app/(mentor)/estudiantes/[id]/calendario/page.tsx`, que lo monta en modo
 * `readOnly` para que el mentor vea exactamente el mismo calendario del alumno.
 *
 * Task 15: además calcula el `LevelStatus` del estudiante y lo pasa como `levelBanner` a
 * `CalendarView`, para el banner de nivel sobre el calendario (mockup 194-215). SOLO esta
 * página lo hace — la del mentor no pasa `levelBanner` en absoluto (`CalendarView` ya
 * condiciona el banner a `!readOnly`, pero evitar el cálculo aquí también evita el trabajo
 * innecesario de niveles/grants cuando el viewer es el mentor).
 *
 * `levelBanner` es el propio `status` — antes viajaba envuelto en `{ status, netPnl }`
 * (con un `computeSummary` recalculado aquí SOLO para reconstruir cuánto dinero faltaba,
 * porque `LevelStatus` no exponía esos montos). Desde que `computeLevelStatus` expone
 * `progressAmount`/`missingAmount` ya calculados con la regla de consumo secuencial
 * (decisión del usuario, ver `lib/metrics/levels.ts`), ese segundo cálculo es innecesario.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string; trade?: string; nuevo?: string; fecha?: string; dia?: string }>
}) {
  const user = await requireUser()
  const resolvedSearchParams = await searchParams
  const { y, m, trade, nuevo, fecha, dia } = resolvedSearchParams

  const db = getDb()
  const [trades, levels, grantedLevelIds] = await Promise.all([
    listTrades(db, user.id),
    listLevels(db),
    listGrantIdsForUser(db, user.id),
  ])

  const initialBalance = user.initialBalance ?? 0
  const status = computeLevelStatus({ trades, initialBalance, levels, grantedLevelIds })

  return (
    <>
      <CalendarView
        trades={trades}
        y={y}
        m={m}
        searchParams={{ trade, nuevo, fecha, dia }}
        readOnly={false}
        basePath="/calendario"
        levelBanner={status}
      />

      <TradeModalGate searchParams={{ trade, nuevo, fecha }} viewer={{ mode: 'owner' }} />
    </>
  )
}
