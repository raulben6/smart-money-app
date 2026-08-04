import { MONTH_NAMES_ES_SHORT } from '@/lib/format'
import type { TradePoint } from './types'

// tradeDate viene como 'YYYY-MM-DD'. Se parsea con split('-') — NUNCA
// new Date(str), que interpreta el string como UTC y puede desplazar el día
// en zonas horarias negativas.
function parseTradeDate(tradeDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = tradeDate.split('-').map(Number)
  return { year, month, day }
}

export type CalendarAggregates = {
  days: Map<number, { pnl: number; count: number }>
  summary: { net: number; daysTraded: number; positiveDays: number; bestDay: number | null }
}

/** Agrega trades por día del mes/año pedidos (month: 1-12). */
export function calendarAggregates(trades: TradePoint[], year: number, month: number): CalendarAggregates {
  const days = new Map<number, { pnl: number; count: number }>()

  for (const t of trades) {
    const d = parseTradeDate(t.tradeDate)
    if (d.year !== year || d.month !== month) continue
    const entry = days.get(d.day) ?? { pnl: 0, count: 0 }
    entry.pnl += t.pnlUsd
    entry.count += 1
    days.set(d.day, entry)
  }

  let net = 0
  let positiveDays = 0
  let bestDay: number | null = null
  for (const { pnl } of days.values()) {
    net += pnl
    if (pnl > 0) positiveDays += 1
    bestDay = bestDay === null ? pnl : Math.max(bestDay, pnl)
  }

  return { days, summary: { net, daysTraded: days.size, positiveDays, bestDay } }
}

/** Un item por mes pedido, con net 0 si no hay trades en ese mes/año. */
export function monthlyAggregates(
  trades: TradePoint[],
  months: { year: number; month: number }[]
): { label: string; net: number }[] {
  return months.map(({ year, month }) => {
    let net = 0
    for (const t of trades) {
      const d = parseTradeDate(t.tradeDate)
      if (d.year === year && d.month === month) net += t.pnlUsd
    }
    return { label: MONTH_NAMES_ES_SHORT[month - 1], net }
  })
}
