import { asc, eq } from 'drizzle-orm'
import { getDb } from '../lib/db'
import { users, trades } from '../lib/db/schema'
import { insertTradeWithJournal } from '../lib/db/queries/trades'
import type { TradeFormValues } from '../lib/validation/trade'

/**
 * Datos de los 13 trades del mockup (_design/smart-money-app.dc.html líneas 563-577),
 * con las fechas re-fechadas al mes calendario actual (mismos números de día) para que
 * `monthlyAggregates` los cuente como "este mes" al verificar visualmente el dashboard.
 */
const MOCKUP_TRADES: {
  day: number
  asset: string
  market: TradeFormValues['market']
  direction: TradeFormValues['direction']
  setup: string
  r: number
  pnl: number
  tf: string
}[] = [
  { day: 3, asset: 'SPY', market: 'indices', direction: 'long', setup: 'Breakout de rango', r: 2.1, pnl: 420, tf: '5m' },
  { day: 3, asset: 'AAPL', market: 'acciones', direction: 'short', setup: 'Fallo de continuación', r: -1.0, pnl: -180, tf: '15m' },
  { day: 6, asset: 'QQQ', market: 'indices', direction: 'long', setup: 'Retest de VWAP', r: 1.4, pnl: 265, tf: '5m' },
  { day: 9, asset: 'NVDA', market: 'acciones', direction: 'long', setup: 'Order block H1', r: -1.0, pnl: -310, tf: '1h' },
  { day: 10, asset: 'SPY', market: 'indices', direction: 'short', setup: 'Barrido de liquidez', r: 3.2, pnl: 640, tf: '5m' },
  { day: 13, asset: 'MSFT', market: 'acciones', direction: 'long', setup: 'Retest de VWAP', r: 0.8, pnl: 145, tf: '15m' },
  { day: 15, asset: 'IWM', market: 'indices', direction: 'short', setup: 'Breakout fallido', r: -1.2, pnl: -240, tf: '5m' },
  { day: 17, asset: 'AAPL', market: 'opciones', direction: 'long', setup: 'Gap and go', r: 2.6, pnl: 510, tf: '5m' },
  { day: 20, asset: 'SPY', market: 'indices', direction: 'long', setup: 'Order block H1', r: 1.9, pnl: 375, tf: '1h' },
  { day: 21, asset: 'TSLA', market: 'acciones', direction: 'short', setup: 'Barrido de liquidez', r: -1.0, pnl: -220, tf: '15m' },
  { day: 24, asset: 'QQQ', market: 'indices', direction: 'long', setup: 'Retest de VWAP', r: 2.4, pnl: 480, tf: '5m' },
  { day: 27, asset: 'META', market: 'opciones', direction: 'long', setup: 'Gap and go', r: 1.1, pnl: 205, tf: '15m' },
  { day: 28, asset: 'SPY', market: 'indices', direction: 'short', setup: 'Breakout de rango', r: -0.6, pnl: -95, tf: '5m' },
]

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

async function main() {
  const db = getDb()

  const [user] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1)
  if (!user) {
    console.log(
      'No hay ningún usuario en la base de datos todavía. Inicia sesión una vez en la app ' +
        '(esto crea la fila de usuario vía requireUser()) y completa el onboarding, luego vuelve a correr este script.',
    )
    return
  }

  const [existingTrade] = await db.select({ id: trades.id }).from(trades).where(eq(trades.userId, user.id)).limit(1)
  if (existingTrade) {
    console.log(`El usuario ${user.id} (${user.name}) ya tiene trades — no se siembra nada (script idempotente).`)
    return
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  for (const t of MOCKUP_TRADES) {
    const values: TradeFormValues = {
      tradeDate: toYmd(year, month, t.day),
      asset: t.asset,
      market: t.market,
      direction: t.direction,
      entryTime: null,
      exitTime: null,
      entryPrice: null,
      exitPrice: null,
      contracts: null,
      positionSize: null,
      stopLoss: null,
      takeProfit: null,
      riskUsd: null,
      riskPct: null,
      pnlUsd: t.pnl,
      rMultiple: t.r,
      setup: t.setup,
      timeframe: t.tf,
      marketConditions: null,
      entryType: null,
      confirmations: null,
    }
    await insertTradeWithJournal(db, user.id, values)
  }

  console.log(`Sembrados ${MOCKUP_TRADES.length} trades para el usuario ${user.id} (${user.name}).`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
