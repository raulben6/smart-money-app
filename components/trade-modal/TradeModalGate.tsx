import { getDb } from '@/lib/db'
import { getTradeDetail } from '@/lib/db/queries/trades'
import { isValidUuid } from '@/lib/validation/uuid'
import { TradeModal, type EditableTrade } from './TradeModal'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' de hoy en hora local (nunca `toISOString`, que puede desplazar el día en zonas negativas). */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Puerta de entrada del modal de operación: server component que decide, a partir de los
 * `searchParams` de la página que lo monta, si se muestra en modo edición (`?trade=<uuid>`,
 * cargando el detalle con su propia consulta a la base de datos), creación (`?nuevo=1`, con
 * `?fecha=` opcional — si falta o no tiene forma de fecha válida, hoy local) o nada.
 *
 * Se monta tanto en `/dashboard` como en `/calendario`; ambas páginas ya llaman a
 * `requireUser()` antes, así que `userId` siempre viene resuelto desde ahí.
 */
export async function TradeModalGate({
  searchParams,
  userId,
}: {
  searchParams: { trade?: string; nuevo?: string; fecha?: string }
  userId: string
}) {
  if (searchParams.trade && isValidUuid(searchParams.trade)) {
    const db = getDb()
    const detail = await getTradeDetail(db, userId, searchParams.trade)
    if (!detail) return null

    const t = detail.trade
    const plain: EditableTrade = {
      id: t.id,
      tradeDate: t.tradeDate,
      asset: t.asset,
      market: t.market,
      direction: t.direction,
      entryTime: t.entryTime ? t.entryTime.slice(0, 5) : null,
      exitTime: t.exitTime ? t.exitTime.slice(0, 5) : null,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      contracts: t.contracts,
      positionSize: t.positionSize,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      riskUsd: t.riskUsd,
      riskPct: t.riskPct,
      pnlUsd: t.pnlUsd,
      rMultiple: t.rMultiple,
      setup: t.setup,
      timeframe: t.timeframe,
      marketConditions: t.marketConditions,
      entryType: t.entryType,
      confirmations: t.confirmations,
    }

    // `key` fuerza a React a desmontar/remontar el modal (y por tanto resetear todo su
    // estado interno — form, paso/pestaña activa, errores) en una transición
    // `?trade=A` -> `?trade=B` en el historial; sin esto, React reconciliaría el mismo
    // `TradeModal` y dejaría el form de A pegado al abrir B.
    return <TradeModal key={plain.id} mode="edit" detail={plain} />
  }

  if (searchParams.nuevo) {
    const fecha = searchParams.fecha && FECHA_RE.test(searchParams.fecha) ? searchParams.fecha : todayLocal()
    return <TradeModal key="create" mode="create" defaultDate={fecha} />
  }

  return null
}
