import { describe, it, expect } from 'vitest'
import { equityPoints, buildLinePath } from '../equity'
import type { TradePoint } from '../types'

describe('equityPoints', () => {
  it('(a) la curva empieza en initialBalance', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-08-03', pnlUsd: 420 },
      { tradeDate: '2025-08-06', pnlUsd: -180 },
    ]
    const points = equityPoints(trades, 25000)
    expect(points[0].balance).toBe(25000)
    expect(points).toHaveLength(3) // punto inicial + 2 trades
    expect(points[1].balance).toBe(25420)
    expect(points[2].balance).toBe(25240)
  })

  it('(a2) sin trades, la curva es solo el punto inicial', () => {
    const points = equityPoints([], 25000)
    expect(points).toHaveLength(1)
    expect(points[0].balance).toBe(25000)
  })

  it('(b) acumula en orden de fecha aunque la lista venga desordenada', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-08-10', pnlUsd: 640 },
      { tradeDate: '2025-08-03', pnlUsd: 420 },
      { tradeDate: '2025-08-06', pnlUsd: -180 },
    ]
    const points = equityPoints(trades, 25000)
    // Ordenado: 08-03 (+420), 08-06 (-180), 08-10 (+640)
    expect(points.map((p) => p.date).slice(1)).toEqual(['2025-08-03', '2025-08-06', '2025-08-10'])
    expect(points[1].balance).toBe(25420)
    expect(points[2].balance).toBe(25240)
    expect(points[3].balance).toBe(25880)
  })

  it('empates de fecha mantienen el orden de entrada', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-08-03', pnlUsd: 100 },
      { tradeDate: '2025-08-03', pnlUsd: 200 },
    ]
    const points = equityPoints(trades, 1000)
    expect(points[1].balance).toBe(1100)
    expect(points[2].balance).toBe(1300)
  })
})

describe('buildLinePath', () => {
  it('(c) produce un string que empieza con M y un área que termina en Z', () => {
    const { line, area } = buildLinePath([25000, 25420], 720, 220)
    expect(line.startsWith('M')).toBe(true)
    expect(line).toContain('L')
    expect(area.endsWith('Z')).toBe(true)
    expect(area.startsWith('M')).toBe(true)
  })

  it('(d) un solo valor no divide por cero (línea horizontal)', () => {
    const { line, area } = buildLinePath([25000], 720, 220)
    expect(line).not.toContain('NaN')
    expect(area).not.toContain('NaN')
    expect(line.startsWith('M')).toBe(true)
    // línea horizontal: mismo y en ambos extremos
    const ys = [...line.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => m[1])
    expect(new Set(ys).size).toBe(1)
  })

  it('array vacío no explota', () => {
    const { line, area } = buildLinePath([], 720, 220)
    expect(line).toBe('')
    expect(area).toBe('')
  })

  it('respeta el padding', () => {
    const { line } = buildLinePath([0, 100], 100, 100, 10)
    const xs = [...line.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]))
    expect(Math.min(...xs)).toBeCloseTo(10, 5)
    expect(Math.max(...xs)).toBeCloseTo(90, 5)
  })
})
