import type { TradePoint } from './types'

export type EquityPoint = { date: string; balance: number }

/**
 * Curva de balance acumulado. Empieza con un punto para el balance inicial
 * (con la fecha del primer trade ordenado, o '' si no hay trades) y luego
 * un punto por trade, en orden de fecha ascendente. Comparación lexicográfica
 * de strings 'YYYY-MM-DD' (equivale a orden cronológico, sin parsear Date).
 * Array.prototype.sort es estable: los empates de fecha mantienen el orden
 * de entrada.
 */
export function equityPoints(trades: TradePoint[], initialBalance: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => {
    if (a.tradeDate < b.tradeDate) return -1
    if (a.tradeDate > b.tradeDate) return 1
    return 0
  })

  const points: EquityPoint[] = [{ date: sorted[0]?.tradeDate ?? '', balance: initialBalance }]
  let balance = initialBalance
  for (const trade of sorted) {
    balance += trade.pnlUsd
    points.push({ date: trade.tradeDate, balance })
  }
  return points
}

/**
 * Construye paths SVG (M/L) para línea y área a partir de una serie de
 * valores igualmente espaciados en el eje X. No depende de fechas.
 */
export function buildLinePath(
  values: number[],
  width: number,
  height: number,
  pad = 0
): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' }

  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const base = height - pad

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const yOf = (v: number) => pad + innerH - (range === 0 ? innerH / 2 : ((v - min) / range) * innerH)

  if (values.length === 1) {
    const y = yOf(values[0]).toFixed(1)
    const xStart = pad.toFixed(1)
    const xEnd = (pad + innerW).toFixed(1)
    const line = `M${xStart},${y} L${xEnd},${y}`
    const area = `${line} L${xEnd},${base.toFixed(1)} L${xStart},${base.toFixed(1)} Z`
    return { line, area }
  }

  const xOf = (i: number) => pad + (i / (values.length - 1)) * innerW
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
  const xLast = xOf(values.length - 1).toFixed(1)
  const xFirst = xOf(0).toFixed(1)
  const area = `${line} L${xLast},${base.toFixed(1)} L${xFirst},${base.toFixed(1)} Z`
  return { line, area }
}
