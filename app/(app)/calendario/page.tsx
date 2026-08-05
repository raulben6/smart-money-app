import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeLevelStatus } from '@/lib/metrics/levels'
import { computeSummary } from '@/lib/metrics/summary'
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
 * `levelBanner` incluye `netPnl` (vía `computeSummary`, la misma función que
 * `computeLevelStatus` usa internamente) ADEMÁS del `status` — hallazgo de revisión: el
 * banner necesita el `netPnl` REAL para su línea 'Te faltan $X...', no uno reconstruido
 * desde `progressPct` (que está topado en [0, 100] y por tanto no distingue "voy en $0" de
 * "voy en -$500"). Sí, esto recalcula `computeSummary` una segunda vez (la primera es
 * interna a `computeLevelStatus`) — recomputar sobre el mismo array de trades ya en
 * memoria es más simple y barato que cambiar la firma de `computeLevelStatus` para que
 * devuelva el summary, y `lib/metrics/*` no se toca en esta tarea.
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
  const netPnl = computeSummary(trades, initialBalance).netPnl

  return (
    <>
      <CalendarView
        trades={trades}
        y={y}
        m={m}
        searchParams={{ trade, nuevo, fecha, dia }}
        readOnly={false}
        basePath="/calendario"
        levelBanner={{ status, netPnl }}
      />

      <TradeModalGate searchParams={{ trade, nuevo, fecha }} viewer={{ mode: 'owner' }} />
    </>
  )
}
