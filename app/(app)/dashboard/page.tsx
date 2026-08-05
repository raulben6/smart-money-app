import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { TradeModalGate } from '@/components/trade-modal/TradeModalGate'

/**
 * Thin wrapper (Task 12): auth + fetch + `DashboardView`. El cuerpo real vive ahí — se
 * comparte con `app/(mentor)/estudiantes/[id]/dashboard/page.tsx`, que lo monta en modo
 * `readOnly` para que el mentor vea exactamente el mismo dashboard del alumno.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; nuevo?: string; fecha?: string }>
}) {
  const user = await requireUser()
  const initialBalance = user.initialBalance!
  const resolvedSearchParams = await searchParams

  const db = getDb()
  const trades = await listTrades(db, user.id)

  return (
    <>
      <DashboardView
        trades={trades}
        initialBalance={initialBalance}
        displayName={user.name}
        readOnly={false}
        basePath="/dashboard"
      />

      <TradeModalGate searchParams={resolvedSearchParams} userId={user.id} />
    </>
  )
}
