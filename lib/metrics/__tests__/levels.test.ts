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
// requisitos progresivos para poder aislar cada gate en los tests. Umbrales
// acumulados de CONSUMO SECUENCIAL (decisión del usuario): L1=500, L2=1500,
// L3=3500, L4=8500, L5=13500.
const LEVELS: LevelDef[] = [
  { id: 'l1', position: 1, name: 'Nivel 1', goalAmount: 500, minProfitFactor: null, minTrades: 10, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l2', position: 2, name: 'Nivel 2', goalAmount: 1000, minProfitFactor: 1.5, minTrades: 20, maxDrawdownPct: 10, manualUnlock: false },
  { id: 'l3', position: 3, name: 'Nivel 3', goalAmount: 2000, minProfitFactor: 1.8, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l4', position: 4, name: 'Nivel 4', goalAmount: 5000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'l5', position: 5, name: 'Nivel 5', goalAmount: 5000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: true },
]

// Fixture SOLO-dinero (sin PF/trades/drawdown/manual) para aislar la cascada
// de consumo secuencial de los demás gates. Acumulados: M1=500, M2=1500, M3=3500.
const MONEY_ONLY_LEVELS: LevelDef[] = [
  { id: 'm1', position: 1, name: 'M1', goalAmount: 500, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'm2', position: 2, name: 'M2', goalAmount: 1000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
  { id: 'm3', position: 3, name: 'M3', goalAmount: 2000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
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

describe('computeLevelStatus — consumo secuencial (cada nivel reinicia su meta de dinero desde cero)', () => {
  it('(a) sin trades: current null, next nivel 1, todos bloqueados salvo nivel 1 en_curso; progressAmount 0, missingAmount = goalAmount(L1)', () => {
    const status = computeLevelStatus({ trades: [], initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    expect(status.current).toBeNull()
    expect(status.next?.id).toBe('l1')
    expect(status.progressPct).toBe(0)
    expect(status.progressAmount).toBe(0)
    expect(status.missingAmount).toBe(500)
    expect(status.perLevel.map((p) => p.state)).toEqual(['en_curso', 'bloqueado', 'bloqueado', 'bloqueado', 'bloqueado'])
  })

  it('(b) [regresión] netPnl 1995, PF~2.9, 13 trades: nivel 1 completado, nivel 2 retiene por trades insuficientes — los montos por nivel YA NO cargan el dinero del nivel anterior', () => {
    const status = computeLevelStatus({ trades: MOCKUP_TRADES, initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    expect(status.current?.id).toBe('l1')
    expect(status.next?.id).toBe('l2')

    // ANTES (umbrales acumulativos, ya derogado): progressAmount no existía;
    // progressPct se leía como netPnl(1995)/goalAmount(l2=1000)*100 = 199.5 -> 100.
    // AHORA: el dinero de L2 se cuenta DESDE CERO tras completar L1 (consumo
    // secuencial). previousCumulative(l2) = cumulativeGoal(l1) = 500;
    // rawProgress = 1995 - 500 = 1495, que YA excede el propio goalAmount de L2
    // (1000) — el dinero se topa en el 100% de la meta de ESE nivel (el
    // excedente no se muestra aquí: el gate de dinero de L2 ya está satisfecho,
    // lo único que retiene a L2 es el gate de operaciones mínimas, no el dinero).
    expect(status.progressAmount).toBe(1000) // topado en goalAmount(l2)
    expect(status.missingAmount).toBe(0) // el dinero de L2 ya está cubierto de sobra
    expect(status.progressPct).toBe(100) // 1000/1000*100 (misma cifra que antes, por otra razón)

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

    // 'Ganancia del nivel' (antes 'Ganancia acumulada'): L1 muestra su propio
    // cubo lleno ($500/$500, no "$1,995/$500" como antes); L2 también topado
    // en su propia meta ($1,000/$1,000) aunque el nivel completo no lo esté
    // (el gate que retiene a L2 es Operaciones mínimas, no el dinero).
    const l1Money = byId.get('l1')!.requirements.find((r) => r.label === 'Ganancia del nivel')
    expect(l1Money?.value).toBe('$500 / $500')
    expect(l1Money?.met).toBe(true)
    const l2Money = byId.get('l2')!.requirements.find((r) => r.label === 'Ganancia del nivel')
    expect(l2Money?.value).toBe('$1,000 / $1,000')
    expect(l2Money?.met).toBe(true)
  })

  it('completar L1 EXACTO en 500 muestra L2 en progreso $0 (el dinero de L2 arranca desde cero, no carga el de L1)', () => {
    const twoLevels: LevelDef[] = [
      { id: 'x1', position: 1, name: 'X1', goalAmount: 500, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
      { id: 'x2', position: 2, name: 'X2', goalAmount: 1000, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false },
    ]
    const trades: TradePoint[] = [{ tradeDate: '2026-01-01', pnlUsd: 500 }]
    const status = computeLevelStatus({ trades, initialBalance: 0, levels: twoLevels, grantedLevelIds: [] })
    expect(status.current?.id).toBe('x1')
    expect(status.next?.id).toBe('x2')
    expect(status.progressAmount).toBe(0)
    expect(status.missingAmount).toBe(1000)
    expect(status.progressPct).toBe(0)
  })

  it('netPnl 1600 con metas solo-dinero (500, 1000, 2000): L1+L2 completos (acumulado L2 = 1500), L3 en progreso 100/2000', () => {
    const trades: TradePoint[] = [{ tradeDate: '2026-01-01', pnlUsd: 1600 }]
    const status = computeLevelStatus({ trades, initialBalance: 0, levels: MONEY_ONLY_LEVELS, grantedLevelIds: [] })
    expect(status.current?.id).toBe('m2')
    expect(status.next?.id).toBe('m3')
    const byId = new Map(status.perLevel.map((p) => [p.level.id, p]))
    expect(byId.get('m1')?.state).toBe('completado')
    expect(byId.get('m2')?.state).toBe('completado')
    expect(byId.get('m3')?.state).toBe('en_curso')

    expect(status.progressAmount).toBe(100) // 1600 - cumulativeGoal(m2=1500) = 100
    expect(status.missingAmount).toBe(1900) // 2000 - 100
    expect(status.progressPct).toBe(5) // 100/2000*100
  })

  it('netPnl negativo: progressAmount 0 (nunca negativo) y missingAmount excede el goalAmount del nivel en curso', () => {
    const level: LevelDef = { id: 'x', position: 1, name: 'X', goalAmount: 500, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const trades: TradePoint[] = [{ tradeDate: '2026-01-01', pnlUsd: -300 }]
    const status = computeLevelStatus({ trades, initialBalance: 0, levels: [level], grantedLevelIds: [] })
    expect(status.current).toBeNull()
    expect(status.next?.id).toBe('x')
    expect(status.progressAmount).toBe(0)
    expect(status.missingAmount).toBe(800) // 500 - (-300)
    expect(status.missingAmount).toBeGreaterThan(level.goalAmount) // 800 > 500
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
    expect(status.progressAmount).toBe(0)
    expect(status.missingAmount).toBe(0)
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

  it('(e) drawdown excedido retiene el nivel aunque el resto de requisitos se cumplan; el dinero ya cubierto se topa en el 100% de SU meta y missingAmount no queda negativo', () => {
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
    // Dinero: netPnl 500 >= goalAmount 400 -> el gate de dinero SÍ pasa (así lo
    // confirma la propia 'Ganancia del nivel'), pero el nivel completo sigue
    // bloqueado por el drawdown. El monto se topa en 400 (no 500) y falta 0
    // (no -100): nunca se muestra más del 100% ni un "falta" negativo.
    const moneyReq = status.perLevel[0].requirements.find((r) => r.label === 'Ganancia del nivel')
    expect(moneyReq?.met).toBe(true)
    expect(moneyReq?.value).toBe('$400 / $400')
    expect(status.progressAmount).toBe(400)
    expect(status.missingAmount).toBe(0)
  })

  it('requirements: un requisito por regla definida en el nivel, no todos los niveles tienen los mismos', () => {
    const status = computeLevelStatus({ trades: [], initialBalance: 25000, levels: LEVELS, grantedLevelIds: [] })
    const byId = new Map(status.perLevel.map((p) => [p.level.id, p.requirements.map((r) => r.label)]))
    expect(byId.get('l1')).toEqual(['Ganancia del nivel', 'Operaciones mínimas'])
    expect(byId.get('l2')).toEqual(['Ganancia del nivel', 'Profit Factor mínimo', 'Operaciones mínimas', 'Drawdown máximo'])
    expect(byId.get('l5')).toEqual(['Ganancia del nivel', 'Desbloqueo del mentor'])
  })

  it('cuando el último nivel también está completado, next es null y progressPct/progressAmount/missingAmount son el default 100/0/0', () => {
    const level: LevelDef = { id: 'solo', position: 1, name: 'Solo', goalAmount: 100, minProfitFactor: null, minTrades: null, maxDrawdownPct: null, manualUnlock: false }
    const trades: TradePoint[] = [{ tradeDate: '2025-01-01', pnlUsd: 500 }]
    const status = computeLevelStatus({ trades, initialBalance: 1000, levels: [level], grantedLevelIds: [] })
    expect(status.current?.id).toBe('solo')
    expect(status.next).toBeNull()
    expect(status.progressPct).toBe(100)
    expect(status.progressAmount).toBe(0)
    expect(status.missingAmount).toBe(0)
    expect(status.perLevel[0].state).toBe('completado')
  })
})
