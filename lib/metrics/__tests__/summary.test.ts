import { describe, it, expect } from 'vitest'
import { computeSummary } from '../summary'
import type { TradePoint } from '../types'

// Los 13 trades del mockup (_design/smart-money-app.dc.html líneas 563-577).
// pnl: +420, -180, +265, -310, +640, +145, -240, +510, +375, -220, +480, +205, -95
// grossProfit = 3040 (8 ganadoras), grossLoss = 1045 (5 perdedoras), netPnl = +1995,
// profitFactor = 3040/1045 = 32/11 ≈ 2.90909..., winRate = 8/13*100 ≈ 61.538...
const MOCKUP_TRADES: TradePoint[] = [
  { tradeDate: '2025-08-03', pnlUsd: 420 },
  { tradeDate: '2025-08-03', pnlUsd: -180 },
  { tradeDate: '2025-08-06', pnlUsd: 265 },
  { tradeDate: '2025-08-09', pnlUsd: -310 },
  { tradeDate: '2025-08-10', pnlUsd: 640 },
  { tradeDate: '2025-08-13', pnlUsd: 145 },
  { tradeDate: '2025-08-15', pnlUsd: -240 },
  { tradeDate: '2025-08-17', pnlUsd: 510 },
  { tradeDate: '2025-08-20', pnlUsd: 375 },
  { tradeDate: '2025-08-21', pnlUsd: -220 },
  { tradeDate: '2025-08-24', pnlUsd: 480 },
  { tradeDate: '2025-08-27', pnlUsd: 205 },
  { tradeDate: '2025-08-28', pnlUsd: -95 },
]

describe('computeSummary', () => {
  it('(a) lista vacía: total 0, ratios null, balance === initialBalance', () => {
    const s = computeSummary([], 25000)
    expect(s.total).toBe(0)
    expect(s.wins).toBe(0)
    expect(s.losses).toBe(0)
    expect(s.netPnl).toBe(0)
    expect(s.grossProfit).toBe(0)
    expect(s.grossLoss).toBe(0)
    expect(s.balance).toBe(25000)
    expect(s.winRate).toBeNull()
    expect(s.profitFactor).toBeNull()
    expect(s.expectancy).toBeNull()
    expect(s.avgWin).toBeNull()
    expect(s.avgLoss).toBeNull()
    expect(s.rbRatio).toBeNull()
    expect(s.bestTrade).toBeNull()
    expect(s.worstTrade).toBeNull()
  })

  it('(b) mezcla de ganadoras/perdedoras: los 13 trades del mockup', () => {
    const s = computeSummary(MOCKUP_TRADES, 25000)
    expect(s.total).toBe(13)
    expect(s.wins).toBe(8)
    expect(s.losses).toBe(5)
    expect(s.grossProfit).toBe(3040)
    expect(s.grossLoss).toBe(1045)
    expect(s.netPnl).toBe(1995)
    expect(s.balance).toBe(25000 + 1995)
    expect(s.winRate).toBeCloseTo((8 / 13) * 100, 10)
    expect(s.profitFactor).toBeCloseTo(3040 / 1045, 10)
    expect(s.avgWin).toBeCloseTo(3040 / 8, 10)
    expect(s.avgLoss).toBeCloseTo(1045 / 5, 10)
    expect(s.rbRatio).toBeCloseTo(380 / 209, 10)
    expect(s.expectancy).toBeCloseTo(1995 / 13, 10)
    expect(s.bestTrade).toBe(640)
    expect(s.worstTrade).toBe(-310)
  })

  it('(c) solo ganadoras: profitFactor null (sin pérdidas), avgLoss null', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-08-01', pnlUsd: 100 },
      { tradeDate: '2025-08-02', pnlUsd: 200 },
      { tradeDate: '2025-08-03', pnlUsd: 300 },
    ]
    const s = computeSummary(trades, 10000)
    expect(s.wins).toBe(3)
    expect(s.losses).toBe(0)
    expect(s.grossLoss).toBe(0)
    expect(s.profitFactor).toBeNull()
    expect(s.avgLoss).toBeNull()
    expect(s.avgWin).toBeCloseTo(200, 10)
    expect(s.winRate).toBe(100)
    expect(s.rbRatio).toBeNull()
  })

  it('(d) solo perdedoras: winRate 0, avgWin null', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-08-01', pnlUsd: -50 },
      { tradeDate: '2025-08-02', pnlUsd: -150 },
    ]
    const s = computeSummary(trades, 10000)
    expect(s.wins).toBe(0)
    expect(s.losses).toBe(2)
    expect(s.grossProfit).toBe(0)
    expect(s.winRate).toBe(0)
    expect(s.avgWin).toBeNull()
    expect(s.rbRatio).toBeNull()
    expect(s.avgLoss).toBeCloseTo(100, 10)
  })
})
