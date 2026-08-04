// Subset estructural de DbTrade (lib/db/schema.ts) — DbTrade[] satisface este tipo
// directamente, sin necesidad de importar nada de lib/db aquí.
export type TradePoint = {
  tradeDate: string
  pnlUsd: number
}

export type Summary = {
  balance: number
  netPnl: number
  grossProfit: number
  grossLoss: number
  wins: number
  losses: number
  total: number
  winRate: number | null
  profitFactor: number | null
  expectancy: number | null
  avgWin: number | null
  avgLoss: number | null
  rbRatio: number | null
  bestTrade: number | null
  worstTrade: number | null
}
