import { requireUser } from '@/lib/auth'
import { getOwnLevelStatus } from '@/lib/level-status'
import { CalendarView } from '@/components/calendar/CalendarView'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Thin wrapper (Task 12): auth + fetch + `CalendarView`. El cuerpo real vive ahí — se
 * comparte con `app/(mentor)/estudiantes/[id]/calendario/page.tsx`, que lo monta en modo
 * `readOnly` para que el mentor vea exactamente el mismo calendario del alumno.
 *
 * Task 15: además obtiene el `LevelStatus` del estudiante (`getOwnLevelStatus`, compartido
 * con el layout y `/mi-nivel` via React.cache — un solo fetch por request) y lo pasa como
 * `levelBanner` a `CalendarView`, para el banner de nivel sobre el calendario (mockup
 * 194-215). SOLO esta página lo hace — la del mentor no pasa `levelBanner` en absoluto
 * (`CalendarView` ya condiciona el banner a `!readOnly`).
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

  const { trades, status } = await getOwnLevelStatus(user.id, user.initialBalance ?? 0)

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
