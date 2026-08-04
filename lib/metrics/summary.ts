import type { Summary, TradePoint } from './types'

/**
 * Calcula el resumen de métricas de una lista de trades. Función pura: no
 * usa fechas del sistema, no ordena por fecha (eso lo hace equityPoints).
 * Ratios se devuelven sin redondear — el formateo es responsabilidad de la UI.
 */
export function computeSummary(trades: TradePoint[], initialBalance: number): Summary {
  let grossProfit = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let bestTrade: number | null = null
  let worstTrade: number | null = null

  for (const t of trades) {
    if (t.pnlUsd > 0) {
      grossProfit += t.pnlUsd
      wins += 1
    } else if (t.pnlUsd < 0) {
      grossLoss += Math.abs(t.pnlUsd)
      losses += 1
    }
    bestTrade = bestTrade === null ? t.pnlUsd : Math.max(bestTrade, t.pnlUsd)
    worstTrade = worstTrade === null ? t.pnlUsd : Math.min(worstTrade, t.pnlUsd)
  }

  const total = trades.length
  const netPnl = grossProfit - grossLoss
  const balance = initialBalance + netPnl

  const winRate = total === 0 ? null : (wins / total) * 100
  const profitFactor = grossLoss === 0 ? null : grossProfit / grossLoss
  const avgWin = wins === 0 ? null : grossProfit / wins
  const avgLoss = losses === 0 ? null : grossLoss / losses
  const rbRatio = avgWin !== null && avgLoss !== null ? avgWin / avgLoss : null
  const expectancy = total === 0 ? null : netPnl / total

  return {
    balance,
    netPnl,
    grossProfit,
    grossLoss,
    wins,
    losses,
    total,
    winRate,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    rbRatio,
    bestTrade,
    worstTrade,
  }
}
