import { describe, it, expect } from 'vitest'
import { maxDrawdownPct, computeLevelStatus } from '../levels'
import type { LevelDef } from '../levels'
import type { TradePoint } from '../types'
import type { DbLevel } from '@/lib/db/schema'

// Chequeo en tiempo de compilación: una fila real de la tabla `levels` debe
// satisfacer LevelDef estructuralmente (Tasks 9/13/14/15 pasan DbLevel[]
// directamente a computeLevelStatus sin mapear). Los campos extra de DbLevel
// (updatedAt) no rompen la asignación porque el origen no es un literal de
// objeto (el chequeo de propiedades excedentes de TS solo aplica a literales).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _dbLevelSatisfiesLevelDef: LevelDef = {} as DbLevel

// Los 13 trades del mockup (mismos que summary.test.ts): netPnl +1995,
// profitFactor 3040/1045 ≈ 2.909, total 13.
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

// 5 niveles al estilo del seed ($500/$1,000/$2,000/$5,000/manual), con
// requisitos progresivos para poder aislar cada gate en los tests.
const LEVELS: LevelDef[] = [
  { id: 'l1', position: 1, name: 'Nivel 1', goalAmount: 500, minProfitFactor: null, minTrades: 10, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l2', position: 2, name: 'Nivel 2', goalAmount: 1000, minProfitFactor: 1.5, minTrades: 20, maxDrawdownPct: 10, manualUnlock: false },
  { id: 'l3', position: 3, name: 'Nivel 3', goalAmount: 2000, minProfitFactor: 1.8, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l4', position: 4, name: 'Nivel 4', goalAmount: 5000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l5', position: 5, name: 'Nivel 5', goalAmount: 5000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: true },
]

describe('maxDrawdownPct', () => {
  it('lista vacía y de un solo elemento → 0', () => {
    expect(maxDrawdownPct([])).toBe(0)
    expect(maxDrawdownPct([100])).toBe(0)
  })

  it('monótona creciente → 0 (nunca cae del pico)', () => {
    expect(maxDrawdownPct([100, 150, 200, 300])).toBe(0)
  })

  it('caída simple 25000 → 24000 es 4%', () => {
    expect(maxDrawdownPct([25000, 24000])).toBeCloseTo(4, 10)
  })

  it('pico y valle no adyacentes: usa el pico acumulado, no el punto anterior', () => {
    // pico 300 en índice 1, valle 200 en índice 4 (tres pasos después, con
    // fluctuaciones intermedias que no superan el pico ni empeoran la caída).
    // dd(250)=16.67%, dd(280)=6.67%, dd(200)=33.33% <- máximo
    const balances = [100, 300, 250, 280, 200, 350]
    expect(maxDrawdownPct(balances)).toBeCloseTo(100 / 3, 10)
  })
})

describe('computeLevelStatus', () => {
  it('(a) sin trades: current null, next nivel 1, todos bloqueados salvo nivel 1 en_curso', () => {
    const status = computeLevelStatus({ trades: [], initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    expect(status.current).toBeNull()
    expect(status.next?.id).toBe('l1')
    expect(status.progressPct).toBe(0)
    expect(status.perLevel.map((p) => p.state)).toEqual(['en_curso', 'bloqueado', 'bloqueado', 'bloqueado', 'bloqueado'])
  })

  it('(b) netPnl 1995, PF~2.9, 13 trades: nivel 1 completado, nivel 2 retiene por trades insuficientes', () => {
    const status = computeLevelStatus({ trades: MOCKUP_TRADES, initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    expect(status.current?.id).toBe('l1')
    expect(status.next?.id).toBe('l2')
    expect(status.progressPct).toBe(100) // 1995/1000*100 = 199.5 -> tope 100

    const byId = new Map(status.perLevel.map((p) => [p.level.id, p]))
    expect(byId.get('l1')?.state).toBe('completado')
    expect(byId.get('l2')?.state).toBe('en_curso')
    expect(byId.get('l3')?.state).toBe('bloqueado')
    expect(byId.get('l4')?.state).toBe('bloqueado')
    expect(byId.get('l5')?.state).toBe('bloqueado')

    const l2Trades = byId.get('l2')!.requirements.find((r) => r.label === 'Operaciones mínimas')
    expect(l2Trades?.met).toBe(false)
    expect(l2Trades?.value).toBe('13 / 20')

    const l2Pf = byId.get('l2')!.requirements.find((r) => r.label === 'Profit Factor mínimo')
    expect(l2Pf?.met).toBe(true) // 2.9 >= 1.5, este gate sí pasa
  })

  it('(c) el gate de Profit Factor retiene el nivel aunque la ganancia ya lo supere', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-01-01', pnlUsd: 1000 },
      { tradeDate: '2025-01-02', pnlUsd: -900 },
    ] // netPnl 100, PF 1000/900 ≈ 1.11
    const level: LevelDef = { id: 'x', position: 1, name: 'X', goalAmount: 100, minProfitFactor: 5, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const status = computeLevelStatus({ trades, initialBalance: 10000, levels: [level], grantedLevelIds: [] })
    expect(status.current).toBeNull()
    expect(status.perLevel[0].state).toBe('en_curso')
    const pfReq = status.perLevel[0].requirements.find((r) => r.label === 'Profit Factor mínimo')
    expect(pfReq?.met).toBe(false)
  })

  it('(c2) PF null sin pérdidas cuenta como cumplido (infinito) si hay ganancias', () => {
    const trades: TradePoint[] = [{ tradeDate: '2025-01-01', pnlUsd: 200 }]
    const level: LevelDef = { id: 'x', position: 1, name: 'X', goalAmount: 100, minProfitFactor: 5, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const status = computeLevelStatus({ trades, initialBalance: 10000, levels: [level], grantedLevelIds: [] })
    expect(status.current?.id).toBe('x')
    const pfReq = status.perLevel[0].requirements.find((r) => r.label === 'Profit Factor mínimo')
    expect(pfReq?.met).toBe(true)
    expect(pfReq?.value).toBe('∞ / 5.00')
  })

  it('(c3) PF null sin trades NO cumple (no hay ganancias que sostengan el infinito); progressPct con next.goalAmount 0 no produce NaN/Infinity', () => {
    const level: LevelDef = { id: 'x', position: 1, name: 'X', goalAmount: 0, minProfitFactor: 5, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const status = computeLevelStatus({ trades: [], initialBalance: 10000, levels: [level], grantedLevelIds: [] })
    expect(status.current).toBeNull()
    expect(status.next?.id).toBe('x')
    // next.goalAmount es 0: se evita la división por cero tratando la meta
    // trivial como ya alcanzada (100), en vez de NaN/Infinity.
    expect(status.progressPct).toBe(100)
  })

  it('(d) manualUnlock sin grant retiene el nivel; con grant lo completa', () => {
    const level: LevelDef = { id: 'manual1', position: 1, name: 'Fondeada', goalAmount: 0, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: true }

    const withoutGrant = computeLevelStatus({ trades: [], initialBalance: 10000, levels: [level], grantedLevelIds: [] })
    expect(withoutGrant.current).toBeNull()
    expect(withoutGrant.perLevel[0].state).toBe('en_curso')
    const req = withoutGrant.perLevel[0].requirements.find((r) => r.label === 'Desbloqueo del mentor')
    expect(req?.met).toBe(false)
    expect(req?.value).toBe('Pendiente')

    const withGrant = computeLevelStatus({ trades: [], initialBalance: 10000, levels: [level], grantedLevelIds: ['manual1'] })
    expect(withGrant.current?.id).toBe('manual1')
    expect(withGrant.perLevel[0].state).toBe('completado')
    const req2 = withGrant.perLevel[0].requirements.find((r) => r.label === 'Desbloqueo del mentor')
    expect(req2?.met).toBe(true)
    expect(req2?.value).toBe('Otorgado')
  })

  it('(e) drawdown excedido retiene el nivel aunque el resto de requisitos se cumplan', () => {
    const trades: TradePoint[] = [
      { tradeDate: '2025-01-01', pnlUsd: 1000 }, // balance 11000 (pico)
      { tradeDate: '2025-01-02', pnlUsd: -800 }, // balance 10200 -> dd ~7.27% desde el pico
      { tradeDate: '2025-01-03', pnlUsd: 300 }, // balance 10500, netPnl total 500
    ]
    const level: LevelDef = { id: 'x', position: 1, name: 'X', goalAmount: 400, minProfitFactor: null, minTrades: null, maxDrawdownPct: 5, manualUnlock: false }
    const status = computeLevelStatus({ trades, initialBalance: 10000, levels: [level], grantedLevelIds: [] })
    expect(status.current).toBeNull()
    const req = status.perLevel[0].requirements.find((r) => r.label === 'Drawdown máximo')
    expect(req?.met).toBe(false)
  })

  it('requirements: un requisito por regla definida en el nivel, no todos los niveles tienen los mismos', () => {
    const status = computeLevelStatus({ trades: [], initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    const byId = new Map(status.perLevel.map((p) => [p.level.id, p.requirements.map((r) => r.label)]))
    expect(byId.get('l1')).toEqual(['Ganancia acumulada', 'Operaciones mínimas'])
    expect(byId.get('l2')).toEqual(['Ganancia acumulada', 'Profit Factor mínimo', 'Operaciones mínimas', 'Drawdown máximo'])
    expect(byId.get('l5')).toEqual(['Ganancia acumulada', 'Desbloqueo del mentor'])
  })

  it('cuando el último nivel también está completado, next es null y progressPct es 100', () => {
    const level: LevelDef = { id: 'solo', position: 1, name: 'Solo', goalAmount: 100, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const trades: TradePoint[] = [{ tradeDate: '2025-01-01', pnlUsd: 500 }]
    const status = computeLevelStatus({ trades, initialBalance: 1000, levels: [level], grantedLevelIds: [] })
    expect(status.current?.id).toBe('solo')
    expect(status.next).toBeNull()
    expect(status.progressPct).toBe(100)
    expect(status.perLevel[0].state).toBe('completado')
  })
})
