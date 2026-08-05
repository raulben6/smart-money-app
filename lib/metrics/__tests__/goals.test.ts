import { describe, it, expect } from 'vitest'
import { computeGoalProgress } from '../goals'
import type { GoalDef, GoalTradePoint } from '../goals'
import type { DbGoal, DbTrade } from '@/lib/db/schema'

// Chequeo en tiempo de compilación: una fila real de `goals`/`trades` debe
// satisfacer GoalDef/GoalTradePoint estructuralmente (Tasks 9/13/14/15 pasan
// DbGoal/DbTrade[] directamente a computeGoalProgress sin mapear). Los campos
// extra (id, userId, createdAt, ...) no rompen la asignación porque el origen
// no es un literal de objeto.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _dbGoalSatisfiesGoalDef: GoalDef = {} as DbGoal
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _dbTradeSatisfiesGoalTradePoint: GoalTradePoint = {} as DbTrade

describe('computeGoalProgress', () => {
  it('(ganancia) suma netPnl de la ventana, ignora trades fuera de rango — cumplido', () => {
    const goal: GoalDef = { kind: 'ganancia', targetValue: 1000, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-05', pnlUsd: 800, riskPct: null },
      { tradeDate: '2026-01-10', pnlUsd: 300, riskPct: null },
      { tradeDate: '2025-12-31', pnlUsd: 99999, riskPct: null }, // fuera: antes de startDate
      { tradeDate: '2026-02-01', pnlUsd: 99999, riskPct: null }, // fuera: después de dueDate
    ]
    const result = computeGoalProgress(goal, trades, '2026-01-15')
    expect(result.current).toBe(1100)
    expect(result.pct).toBe(100)
    expect(result.status).toBe('cumplido')
  })

  it('(cumplido) pct se limita a 100 aunque el actual supere la meta', () => {
    const goal: GoalDef = { kind: 'ganancia', targetValue: 500, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [{ tradeDate: '2026-01-05', pnlUsd: 900, riskPct: null }]
    const result = computeGoalProgress(goal, trades, '2026-01-10')
    expect(result.current).toBe(900)
    expect(result.pct).toBe(100)
    expect(result.status).toBe('cumplido')
  })

  it('(operaciones) cuenta trades de la ventana — en_curso', () => {
    const goal: GoalDef = { kind: 'operaciones', targetValue: 10, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = Array.from({ length: 6 }, (_, i) => ({
      tradeDate: `2026-01-0${i + 1}`,
      pnlUsd: 10,
      riskPct: null,
    }))
    const result = computeGoalProgress(goal, trades, '2026-01-10')
    expect(result.current).toBe(6)
    expect(result.pct).toBe(60)
    expect(result.status).toBe('en_curso')
  })

  it('(win_rate) usa el winRate de la ventana como valor actual — en_riesgo con pct 40 y 5 días restantes', () => {
    const goal: GoalDef = { kind: 'win_rate', targetValue: 100, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-20' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-01', pnlUsd: 100, riskPct: null },
      { tradeDate: '2026-01-02', pnlUsd: 100, riskPct: null },
      { tradeDate: '2026-01-03', pnlUsd: -50, riskPct: null },
      { tradeDate: '2026-01-04', pnlUsd: -50, riskPct: null },
      { tradeDate: '2026-01-05', pnlUsd: -50, riskPct: null },
    ] // 2 de 5 ganadoras = 40%
    const result = computeGoalProgress(goal, trades, '2026-01-15') // dueDate - today = 5 días
    expect(result.current).toBeCloseTo(40, 10)
    expect(result.pct).toBeCloseTo(40, 10)
    expect(result.status).toBe('en_riesgo')
  })

  it('(win_rate) sin trades en la ventana, current es 0 (no null)', () => {
    const goal: GoalDef = { kind: 'win_rate', targetValue: 80, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-12-31' }
    const result = computeGoalProgress(goal, [], '2026-01-01')
    expect(result.current).toBe(0)
    expect(result.pct).toBe(0)
  })

  it('(vencido) todayISO posterior a dueDate con pct < 100', () => {
    const goal: GoalDef = { kind: 'ganancia', targetValue: 1000, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-20' }
    const trades: GoalTradePoint[] = [{ tradeDate: '2026-01-10', pnlUsd: 300, riskPct: null }]
    const result = computeGoalProgress(goal, trades, '2026-02-01')
    expect(result.pct).toBeCloseTo(30, 10)
    expect(result.status).toBe('vencido')
  })

  it('cumplido gana sobre vencido: si la meta ya se alcanzó, el status es cumplido aunque sea tarde', () => {
    const goal: GoalDef = { kind: 'ganancia', targetValue: 200, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-20' }
    const trades: GoalTradePoint[] = [{ tradeDate: '2026-01-10', pnlUsd: 300, riskPct: null }]
    const result = computeGoalProgress(goal, trades, '2026-02-01')
    expect(result.status).toBe('cumplido')
  })

  it('(manual) usa manualProgress directamente — pct 60', () => {
    const goal: GoalDef = { kind: 'manual', targetValue: 100, thresholdValue: null, manualProgress: 60, startDate: '2026-01-01', dueDate: '2026-12-31' }
    const result = computeGoalProgress(goal, [], '2026-06-01')
    expect(result.current).toBe(60)
    expect(result.pct).toBe(60)
    expect(result.status).toBe('en_curso')
  })

  it('(manual) manualProgress null se trata como 0', () => {
    const goal: GoalDef = { kind: 'manual', targetValue: 100, thresholdValue: null, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-12-31' }
    const result = computeGoalProgress(goal, [], '2026-06-01')
    expect(result.current).toBe(0)
    expect(result.pct).toBe(0)
  })

  it('(riesgo_diario) un día que excede el umbral reinicia el conteo (3 ok, 1 exceso, 2 ok -> current 2)', () => {
    const goal: GoalDef = { kind: 'riesgo_diario', targetValue: 5, thresholdValue: 2, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-01', pnlUsd: 10, riskPct: 1 },
      { tradeDate: '2026-01-02', pnlUsd: 10, riskPct: 1.5 },
      { tradeDate: '2026-01-03', pnlUsd: 10, riskPct: 0.5 },
      { tradeDate: '2026-01-04', pnlUsd: -50, riskPct: 3 }, // excede 2% -> reinicia
      { tradeDate: '2026-01-05', pnlUsd: 10, riskPct: 1 },
      { tradeDate: '2026-01-06', pnlUsd: 10, riskPct: 1 },
    ]
    const result = computeGoalProgress(goal, trades, '2026-01-06')
    expect(result.current).toBe(2)
    expect(result.pct).toBe(40)
  })

  it('(riesgo_diario) suma varios trades del mismo día para evaluar el exceso', () => {
    const goal: GoalDef = { kind: 'riesgo_diario', targetValue: 3, thresholdValue: 2, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-01', pnlUsd: 10, riskPct: 1.2 },
      { tradeDate: '2026-01-01', pnlUsd: -10, riskPct: 1.2 }, // suma día 1: 2.4 > 2 -> excede
      { tradeDate: '2026-01-02', pnlUsd: 10, riskPct: 1 },
    ]
    const result = computeGoalProgress(goal, trades, '2026-01-02')
    expect(result.current).toBe(1) // día 1 excede y reinicia; solo cuenta el día 2
  })

  it('(riesgo_diario) días sin trades no rompen ni extienden la racha; ignora días posteriores a todayISO', () => {
    const goal: GoalDef = { kind: 'riesgo_diario', targetValue: 5, thresholdValue: 2, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-01', pnlUsd: 10, riskPct: 1 },
      // 2026-01-02..04 sin trades: huecos que no rompen la racha
      { tradeDate: '2026-01-05', pnlUsd: 10, riskPct: 1 },
      { tradeDate: '2026-01-10', pnlUsd: 10, riskPct: 5 }, // excede, pero es posterior a todayISO -> se ignora
    ]
    const result = computeGoalProgress(goal, trades, '2026-01-06')
    expect(result.current).toBe(2) // solo los 2 días operados y evaluados hasta hoy
  })

  it('(riesgo_diario) riskPct null aporta 0 al riesgo diario del día', () => {
    const goal: GoalDef = { kind: 'riesgo_diario', targetValue: 5, thresholdValue: 2, manualProgress: null, startDate: '2026-01-01', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [{ tradeDate: '2026-01-01', pnlUsd: 10, riskPct: null }]
    const result = computeGoalProgress(goal, trades, '2026-01-01')
    expect(result.current).toBe(1)
  })

  it('(riesgo_diario) respeta la ventana startDate..dueDate igual que los demás kinds', () => {
    const goal: GoalDef = { kind: 'riesgo_diario', targetValue: 5, thresholdValue: 2, manualProgress: null, startDate: '2026-01-05', dueDate: '2026-01-31' }
    const trades: GoalTradePoint[] = [
      { tradeDate: '2026-01-01', pnlUsd: 10, riskPct: 9 }, // fuera de ventana (antes de startDate): ignorado, no reinicia nada
      { tradeDate: '2026-01-05', pnlUsd: 10, riskPct: 1 },
      { tradeDate: '2026-01-06', pnlUsd: 10, riskPct: 1 },
    ]
    const result = computeGoalProgress(goal, trades, '2026-01-06')
    expect(result.current).toBe(2)
  })
})
