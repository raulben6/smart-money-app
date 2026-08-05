import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { CalendarView } from '@/components/calendar/CalendarView'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Thin wrapper (Task 12): auth + fetch + `CalendarView`. El cuerpo real vive ahí — se
 * comparte con `app/(mentor)/estudiantes/[id]/calendario/page.tsx`, que lo monta en modo
 * `readOnly` para que el mentor vea exactamente el mismo calendario del alumno.
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
  const trades = await listTrades(db, user.id)

  return (
    <>
      <CalendarView
        trades={trades}
        y={y}
        m={m}
        searchParams={{ trade, nuevo, fecha, dia }}
        readOnly={false}
        basePath="/calendario"
      />

      <TradeModalGate searchParams={{ trade, nuevo, fecha }} userId={user.id} />
    </>
  )
}
