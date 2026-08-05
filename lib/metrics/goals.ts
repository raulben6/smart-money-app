import { computeSummary } from './summary'
import type { TradePoint } from './types'

// Estructural — DbGoal (lib/db/schema.ts) satisface este tipo directamente,
// sin necesidad de importar nada de lib/db aquí.
export type GoalDef = {
  kind: 'ganancia' | 'operaciones' | 'win_rate' | 'riesgo_diario' | 'manual'
  targetValue: number
  thresholdValue: number | null
  manualProgress: number | null
  startDate: string
  dueDate: string
}

// Estructural — DbTrade satisface este tipo directamente (igual que TradePoint).
export type GoalTradePoint = TradePoint & { riskPct: number | null }

// tradeDate/startDate/dueDate/todayISO llegan como 'YYYY-MM-DD' — se parsean
// con split('-'), NUNCA new Date(str) (que interpreta el string como UTC y
// puede desplazar el día en zonas horarias negativas).
function parseISODate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** Días de calendario entre dos fechas ISO (toISO - fromISO), vía Date.UTC sobre partes numéricas ya parseadas. */
function daysBetween(fromISO: string, toISO: string): number {
  const from = parseISODate(fromISO)
  const to = parseISODate(toISO)
  const fromMs = Date.UTC(from.year, from.month - 1, from.day)
  const toMs = Date.UTC(to.year, to.month - 1, to.day)
  return Math.round((toMs - fromMs) / 86_400_000)
}

function inWindow(tradeDate: string, startDate: string, dueDate: string): boolean {
  return tradeDate >= startDate && tradeDate <= dueDate
}

/**
 * Racha de días consecutivos (operados) sin exceder thresholdValue% de
 * riesgo diario, evaluada hasta todayISO inclusive.
 *
 * Resolución de ambigüedad del spec: solo se evalúan los días CON al menos
 * un trade — un día sin trades ni rompe ni extiende la racha (simplemente no
 * existe en el recorrido). La racha cuenta días operados consecutivos sin
 * violación desde la última violación: un día cuya suma de riskPct excede el
 * umbral reinicia el conteo a 0 (ese día no cuenta), y el día operado
 * siguiente retoma la cuenta desde 1.
 */
function riesgoDiarioStreak(trades: GoalTradePoint[], thresholdValue: number, todayISO: string): number {
  const riskByDay = new Map<string, number>()
  for (const trade of trades) {
    if (trade.tradeDate > todayISO) continue
    riskByDay.set(trade.tradeDate, (riskByDay.get(trade.tradeDate) ?? 0) + (trade.riskPct ?? 0))
  }

  const days = [...riskByDay.keys()].sort()
  let streak = 0
  for (const day of days) {
    const dailyRisk = riskByDay.get(day) ?? 0
    streak = dailyRisk > thresholdValue ? 0 : streak + 1
  }
  return streak
}

/**
 * Progreso de un objetivo a partir de los trades reales del alumno. Función
 * pura: todos los kinds métricos evalúan solo los trades cuya tradeDate cae
 * dentro de la ventana [startDate, dueDate] (comparación lexicográfica de
 * strings 'YYYY-MM-DD', equivalente a orden cronológico). `todayISO` llega
 * por parámetro (nunca Date.now()/new Date() sin argumentos).
 */
export function computeGoalProgress(
  goal: GoalDef,
  trades: GoalTradePoint[],
  todayISO: string
): { current: number; pct: number; status: 'cumplido' | 'en_curso' | 'en_riesgo' | 'vencido' } {
  const windowTrades = trades.filter((t) => inWindow(t.tradeDate, goal.startDate, goal.dueDate))

  let current: number
  switch (goal.kind) {
    case 'ganancia':
      current = computeSummary(windowTrades, 0).netPnl
      break
    case 'operaciones':
      current = windowTrades.length
      break
    case 'win_rate':
      current = computeSummary(windowTrades, 0).winRate ?? 0
      break
    case 'riesgo_diario':
      current = riesgoDiarioStreak(windowTrades, goal.thresholdValue ?? 0, todayISO)
      break
    case 'manual':
      current = goal.manualProgress ?? 0
      break
  }

  const pct = goal.targetValue > 0 ? Math.min(100, Math.max(0, (current / goal.targetValue) * 100)) : current >= goal.targetValue ? 100 : 0

  let status: 'cumplido' | 'en_curso' | 'en_riesgo' | 'vencido'
  if (pct >= 100) {
    status = 'cumplido'
  } else if (todayISO > goal.dueDate) {
    status = 'vencido'
  } else {
    const daysToDue = daysBetween(todayISO, goal.dueDate)
    status = pct < 50 && daysToDue <= 7 ? 'en_riesgo' : 'en_curso'
  }

  return { current, pct, status }
}
