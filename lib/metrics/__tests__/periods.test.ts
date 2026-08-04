import { describe, it, expect } from 'vitest'
import { calendarAggregates, monthlyAggregates } from '../periods'
import { money, signedMoney, pct } from '../../format'
import type { TradePoint } from '../types'

describe('calendarAggregates', () => {
  const trades: TradePoint[] = [
    { tradeDate: '2025-08-03', pnlUsd: 420 },
    { tradeDate: '2025-08-03', pnlUsd: -180 },
    { tradeDate: '2025-08-06', pnlUsd: 265 },
    { tradeDate: '2025-07-31', pnlUsd: 9999 }, // otro mes: ignorado
    { tradeDate: '2024-08-03', pnlUsd: 9999 }, // otro año: ignorado
  ]

  it('agrupa trades por día del mes pedido e ignora otros meses/años', () => {
    const { days } = calendarAggregates(trades, 2025, 8)
    expect(days.size).toBe(2)
    expect(days.get(3)).toEqual({ pnl: 240, count: 2 }) // 420 - 180
    expect(days.get(6)).toEqual({ pnl: 265, count: 1 })
    expect(days.has(31)).toBe(false)
  })

  it('summary.net suma solo los días del mes pedido', () => {
    const { summary } = calendarAggregates(trades, 2025, 8)
    expect(summary.net).toBe(240 + 265)
    expect(summary.daysTraded).toBe(2)
  })

  it('positiveDays cuenta días con suma > 0', () => {
    const negTrades: TradePoint[] = [
      { tradeDate: '2025-08-01', pnlUsd: 100 },
      { tradeDate: '2025-08-02', pnlUsd: -50 },
      { tradeDate: '2025-08-02', pnlUsd: -10 }, // día 2: neto -60
    ]
    const { summary } = calendarAggregates(negTrades, 2025, 8)
    expect(summary.positiveDays).toBe(1)
  })

  it('bestDay es la mayor suma diaria', () => {
    const { summary } = calendarAggregates(trades, 2025, 8)
    expect(summary.bestDay).toBe(265)
  })

  it('bestDay es null sin trades en el mes', () => {
    const { summary, days } = calendarAggregates([], 2025, 8)
    expect(summary.bestDay).toBeNull()
    expect(summary.net).toBe(0)
    expect(summary.daysTraded).toBe(0)
    expect(summary.positiveDays).toBe(0)
    expect(days.size).toBe(0)
  })
})

describe('monthlyAggregates', () => {
  it('devuelve un item por mes pedido aunque no haya trades (net 0), label correcto', () => {
    const trades: TradePoint[] = [{ tradeDate: '2025-06-15', pnlUsd: 500 }]
    const months = [
      { year: 2025, month: 5 },
      { year: 2025, month: 6 },
      { year: 2025, month: 7 },
    ]
    const result = monthlyAggregates(trades, months)
    expect(result).toEqual([
      { label: 'May', net: 0 },
      { label: 'Jun', net: 500 },
      { label: 'Jul', net: 0 },
    ])
  })

  it('etiquetas cubren los 12 meses en orden', () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ year: 2025, month: i + 1 }))
    const result = monthlyAggregates([], months)
    expect(result.map((r) => r.label)).toEqual([
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ])
  })

  it('suma varios trades del mismo mes, ignora otros años', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-06-01', pnlUsd: 100 },
      { tradeDate: '2025-06-30', pnlUsd: -40 },
      { tradeDate: '2024-06-15', pnlUsd: 9999 },
    ]
    const result = monthlyAggregates(trades, [{ year: 2025, month: 6 }])
    expect(result).toEqual([{ label: 'Jun', net: 60 }])
  })
})

describe('format', () => {
  it('money formatea USD sin decimales, con separador de miles', () => {
    expect(money(1595)).toBe('$1,595')
    expect(money(0)).toBe('$0')
    expect(money(-180)).toBe('-$180')
    expect(money(1000000)).toBe('$1,000,000')
  })

  it('signedMoney antepone signo', () => {
    expect(signedMoney(420)).toBe('+$420')
    expect(signedMoney(-180)).toBe('-$180')
    expect(signedMoney(0)).toBe('+$0')
  })

  it('pct formatea porcentaje redondeando (0 decimales por defecto)', () => {
    expect(pct(61.538461538461538)).toBe('62%')
    expect(pct(0)).toBe('0%')
  })

  it('pct acepta dígitos explícitos', () => {
    expect(pct(2.909090909090909, 2)).toBe('2.91%')
  })
})
