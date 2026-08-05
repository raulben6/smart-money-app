import { money, pct } from '@/lib/format'
import { computeSummary } from './summary'
import { equityPoints } from './equity'
import type { Summary, TradePoint } from './types'

/**
 * Mayor caída pico-a-valle de una serie de balances, en % del pico (siempre
 * positivo o 0). 0 si la serie tiene 0 o 1 elementos, o si es monótona
 * creciente (nunca cae por debajo del pico acumulado hasta el momento).
 * Recorre la serie una vez llevando el pico acumulado; no reordena ni
 * depende de fechas — recibe los balances ya en el orden correcto.
 */
export function maxDrawdownPct(balances: number[]): number {
  if (balances.length < 2) return 0

  let peak = balances[0]
  let maxDd = 0
  for (const balance of balances) {
    if (balance > peak) peak = balance
    if (peak > 0) {
      const dd = ((peak - balance) / peak) * 100
      if (dd > maxDd) maxDd = dd
    }
  }
  return maxDd
}

// Estructural — DbLevel (lib/db/schema.ts) satisface este tipo directamente,
// sin necesidad de importar nada de lib/db aquí.
export type LevelDef = {
  id: string
  position: number
  name: string
  goalAmount: number
  minProfitFactor: number | null
  minTrades: number | null
  maxDrawdownPct: number | null
  manualUnlock: boolean
}

export type LevelStatus = {
  current: LevelDef | null
  next: LevelDef | null
  progressPct: number
  perLevel: {
    level: LevelDef
    state: 'completado' | 'en_curso' | 'bloqueado'
    requirements: { label: string; value: string; met: boolean }[]
  }[]
}

/**
 * El requisito de Profit Factor se cumple cuando el PF numérico alcanza el
 * mínimo, O cuando no hay pérdidas y sí ganancias (PF efectivamente
 * infinito — computeSummary devuelve profitFactor null en ese caso). Sin
 * trades (grossProfit === 0 y grossLoss === 0) profitFactor también es null,
 * pero NO cumple: no hay ganancias que sostengan un "infinito".
 */
function pfGateMet(min: number, profitFactor: number | null, grossLoss: number, grossProfit: number): boolean {
  if (profitFactor !== null) return profitFactor >= min
  return grossLoss === 0 && grossProfit > 0
}

function pfDisplay(profitFactor: number | null, grossLoss: number, grossProfit: number): string {
  if (profitFactor !== null) return profitFactor.toFixed(2)
  return grossLoss === 0 && grossProfit > 0 ? '∞' : '—'
}

function levelCompleted(level: LevelDef, summary: Summary, drawdown: number, grantedLevelIds: string[]): boolean {
  if (summary.netPnl < level.goalAmount) return false
  if (level.minProfitFactor !== null && !pfGateMet(level.minProfitFactor, summary.profitFactor, summary.grossLoss, summary.grossProfit)) {
    return false
  }
  if (level.minTrades !== null && summary.total < level.minTrades) return false
  if (level.maxDrawdownPct !== null && drawdown > level.maxDrawdownPct) return false
  if (level.manualUnlock && !grantedLevelIds.includes(level.id)) return false
  return true
}

/** Un requisito por regla definida en el nivel — los niveles sin esa regla (null / false) no la listan. */
function buildRequirements(
  level: LevelDef,
  summary: Summary,
  drawdown: number,
  grantedLevelIds: string[]
): { label: string; value: string; met: boolean }[] {
  const requirements: { label: string; value: string; met: boolean }[] = []

  requirements.push({
    label: 'Ganancia acumulada',
    value: `${money(summary.netPnl)} / ${money(level.goalAmount)}`,
    met: summary.netPnl >= level.goalAmount,
  })

  if (level.minProfitFactor !== null) {
    requirements.push({
      label: 'Profit Factor mínimo',
      value: `${pfDisplay(summary.profitFactor, summary.grossLoss, summary.grossProfit)} / ${level.minProfitFactor.toFixed(2)}`,
      met: pfGateMet(level.minProfitFactor, summary.profitFactor, summary.grossLoss, summary.grossProfit),
    })
  }

  if (level.minTrades !== null) {
    requirements.push({
      label: 'Operaciones mínimas',
      value: `${summary.total} / ${level.minTrades}`,
      met: summary.total >= level.minTrades,
    })
  }

  if (level.maxDrawdownPct !== null) {
    requirements.push({
      label: 'Drawdown máximo',
      value: `${pct(drawdown, 2)} / ${pct(level.maxDrawdownPct, 2)}`,
      met: drawdown <= level.maxDrawdownPct,
    })
  }

  if (level.manualUnlock) {
    const granted = grantedLevelIds.includes(level.id)
    requirements.push({
      label: 'Desbloqueo del mentor',
      value: granted ? 'Otorgado' : 'Pendiente',
      met: granted,
    })
  }

  return requirements
}

/**
 * Estado de niveles a partir de las métricas reales del alumno. Función
 * pura: reutiliza computeSummary (netPnl/PF/total) y equityPoints (curva de
 * balance para el drawdown), sin fechas del sistema.
 *
 * `current` = el nivel `completado` de mayor `position` (o null si ninguno).
 * `next` = el primer nivel por `position` posterior a `current` (o el de
 * menor `position` si `current` es null; o null si `current` es el último).
 * `progressPct` = avance hacia `next` (100 si no hay `next`, es decir, ya se
 * completó el último nivel).
 */
export function computeLevelStatus(input: {
  trades: TradePoint[]
  initialBalance: number
  levels: LevelDef[]
  grantedLevelIds: string[]
}): LevelStatus {
  const { trades, initialBalance, levels, grantedLevelIds } = input

  const summary = computeSummary(trades, initialBalance)
  const balances = equityPoints(trades, initialBalance).map((p) => p.balance)
  const drawdown = maxDrawdownPct(balances)

  const sorted = [...levels].sort((a, b) => a.position - b.position)

  const completedById = new Map<string, boolean>()
  for (const level of sorted) {
    completedById.set(level.id, levelCompleted(level, summary, drawdown, grantedLevelIds))
  }

  let current: LevelDef | null = null
  for (const level of sorted) {
    if (completedById.get(level.id)) current = level
  }

  const currentPosition = current?.position ?? -Infinity
  const next = sorted.find((level) => level.position > currentPosition) ?? null

  const progressPct = next === null ? 100 : next.goalAmount > 0 ? Math.min(100, Math.max(0, (summary.netPnl / next.goalAmount) * 100)) : 100

  const perLevel = sorted.map((level) => {
    const completed = completedById.get(level.id) ?? false
    const state: 'completado' | 'en_curso' | 'bloqueado' = completed
      ? 'completado'
      : next !== null && level.id === next.id
        ? 'en_curso'
        : 'bloqueado'
    return { level, state, requirements: buildRequirements(level, summary, drawdown, grantedLevelIds) }
  })

  return { current, next, progressPct, perLevel }
}
