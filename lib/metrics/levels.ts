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
  /** Dinero ganado DENTRO del nivel `next` (0 si no hay `next`). Ver `levelProgressAmount`. */
  progressAmount: number
  /** Dinero que falta para el nivel `next` (0 si no hay `next`). Puede exceder `next.goalAmount` con netPnl muy negativo — ver doc de `computeLevelStatus`. */
  missingAmount: number
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

/**
 * Consumo secuencial de la meta monetaria — decisión del usuario en el smoke
 * test (reemplaza los umbrales acumulativos del mockup, ver
 * docs/superpowers/specs/2026-08-04-smart-money-fase-2-design.md): cada nivel
 * exige ganar SU PROPIO goalAmount desde cero tras completar el anterior,
 * como llenar cubos en cascada, en vez de comparar netPnl contra la suma de
 * metas acumuladas desde siempre.
 *
 * `cumulativeGoal(N)` (uso interno, nunca expuesto) = suma de goalAmount de
 * los niveles 1..N en orden de `position` — es el umbral REAL de netPnl para
 * que el nivel N esté completo. Esta función devuelve, por id de nivel,
 * `previousCumulative` (la suma EXCLUSIVA de los niveles anteriores — cuánto
 * de netPnl "ya se consumió" antes de llegar a este nivel) y `cumulative`
 * (la suma INCLUSIVE — el gate de completado de ESTE nivel).
 */
function cumulativeGoalsById(sorted: LevelDef[]): Map<string, { previousCumulative: number; cumulative: number }> {
  const byId = new Map<string, { previousCumulative: number; cumulative: number }>()
  let running = 0
  for (const level of sorted) {
    const previousCumulative = running
    running += level.goalAmount
    byId.set(level.id, { previousCumulative, cumulative: running })
  }
  return byId
}

/**
 * Dinero "dentro del cubo" de este nivel: la porción de netPnl que le
 * corresponde a ESTE nivel una vez restado lo ya consumido por los niveles
 * anteriores (`previousCumulative`). Acotado por abajo en 0 (un netPnl por
 * debajo del umbral anterior nunca resta) y por arriba en el propio
 * `goalAmount` del nivel (un nivel nunca muestra más del 100% de SU meta —
 * el excedente es lo que hace avanzar al SIGUIENTE nivel en la cascada, no
 * a este). Se usa tanto para el requisito 'Ganancia del nivel' de
 * CUALQUIER nivel (completado, en curso o bloqueado) como, cuando el nivel
 * es `next`, para `LevelStatus.progressAmount`.
 */
function levelProgressAmount(level: LevelDef, previousCumulative: number, netPnl: number): number {
  return Math.min(level.goalAmount, Math.max(0, netPnl - previousCumulative))
}

/** `moneyNet`: netPnl efectivo para la escalera de dinero (netPnl - baselineNet
 * cuando hay asignación manual; el netPnl completo en el caso normal). Los
 * gates de PF/trades/drawdown siguen siendo sobre la cuenta completa (summary). */
function levelCompleted(level: LevelDef, cumulativeGoal: number, summary: Summary, drawdown: number, grantedLevelIds: string[], moneyNet: number): boolean {
  if (moneyNet < cumulativeGoal) return false
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
  previousCumulative: number,
  summary: Summary,
  drawdown: number,
  grantedLevelIds: string[],
  moneyNet: number
): { label: string; value: string; met: boolean }[] {
  const requirements: { label: string; value: string; met: boolean }[] = []

  const rawProgress = moneyNet - previousCumulative
  requirements.push({
    label: 'Ganancia del nivel',
    value: `${money(levelProgressAmount(level, previousCumulative, moneyNet))} / ${money(level.goalAmount)}`,
    met: rawProgress >= level.goalAmount,
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
 *
 * El gate de dinero es de CONSUMO SECUENCIAL (decisión del usuario): un
 * nivel está completo cuando netPnl alcanza la suma acumulada de goalAmount
 * de todos los niveles hasta el suyo inclusive (`cumulativeGoalsById`), pero
 * lo que se MUESTRA como progreso de dinero de un nivel es solo la porción
 * que le toca a ESE nivel (`levelProgressAmount`) — completar el Nivel 1 en
 * $500 muestra al Nivel 2 arrancando en $0, no en $500. Los demás gates
 * (PF/trades/drawdown/manualUnlock) son sobre la cuenta completa, sin
 * cambios.
 *
 * `progressAmount`/`missingAmount` (nuevos, top-level) resumen el dinero del
 * nivel `next` para que los consumidores no repitan esta aritmética:
 * `progressAmount` = `levelProgressAmount(next, ...)` (acotado en
 * [0, next.goalAmount]); `missingAmount` = `next.goalAmount - rawProgress`
 * (con `rawProgress` SIN acotar por abajo) acotado solo en 0 — por eso SÍ
 * puede exceder `next.goalAmount` cuando netPnl es muy negativo (ej. -$300
 * contra una meta de $500 → faltan $800, no $500), pero nunca es negativo
 * en el caso patológico contrario (el dinero de `next` ya está cubierto de
 * sobra pero el nivel sigue bloqueado por otro gate — ver test "(e)").
 * `progressPct` = `progressAmount / next.goalAmount * 100` (100 si no hay
 * `next`, ambos montos en top-level son 0 en ese caso: no hay nivel "en
 * curso" del que mostrar dinero).
 */
export function computeLevelStatus(input: {
  trades: TradePoint[]
  initialBalance: number
  levels: LevelDef[]
  grantedLevelIds: string[]
  /**
   * Asignación manual del mentor (ronda 16 del smoke test): el estudiante
   * ARRANCA en el nivel con esta `position` (default 1 = sin asignación).
   * Los niveles anteriores quedan 'completado' por asignación — no consumen
   * dinero y su único requisito es 'Asignación del mentor'. La escalera de
   * consumo secuencial se recalcula desde el nivel asignado.
   */
  startPosition?: number
  /**
   * netPnl del estudiante EN EL MOMENTO de la asignación (default 0). El
   * dinero de la escalera es `netPnl - baselineNet`: el nivel asignado
   * arranca desde cero aunque el estudiante ya tuviera ganancias — coherente
   * con la regla de "al pasar de nivel el progreso regresa a 0". Los gates de
   * PF/operaciones/drawdown siguen midiendo la cuenta completa.
   */
  baselineNet?: number
}): LevelStatus {
  const { trades, initialBalance, levels, grantedLevelIds } = input
  const startPosition = input.startPosition ?? 1
  const baselineNet = input.baselineNet ?? 0

  const summary = computeSummary(trades, initialBalance)
  const balances = equityPoints(trades, initialBalance).map((p) => p.balance)
  const drawdown = maxDrawdownPct(balances)
  const moneyNet = summary.netPnl - baselineNet

  const sorted = [...levels].sort((a, b) => a.position - b.position)
  // La escalera de dinero solo incluye los niveles desde el asignado; los
  // anteriores no aparecen en el mapa (completados por asignación, sin cubo).
  const ladder = sorted.filter((level) => level.position >= startPosition)
  const cumulativeGoals = cumulativeGoalsById(ladder)

  const completedById = new Map<string, boolean>()
  for (const level of sorted) {
    if (level.position < startPosition) {
      completedById.set(level.id, true)
      continue
    }
    const { cumulative } = cumulativeGoals.get(level.id)!
    completedById.set(level.id, levelCompleted(level, cumulative, summary, drawdown, grantedLevelIds, moneyNet))
  }

  let current: LevelDef | null = null
  for (const level of sorted) {
    if (completedById.get(level.id)) current = level
  }

  const currentPosition = current?.position ?? -Infinity
  const next = sorted.find((level) => level.position > currentPosition) ?? null

  let progressAmount = 0
  let missingAmount = 0
  let progressPct = 100
  if (next !== null) {
    const { previousCumulative } = cumulativeGoals.get(next.id)!
    const rawProgress = moneyNet - previousCumulative
    progressAmount = levelProgressAmount(next, previousCumulative, moneyNet)
    missingAmount = Math.max(0, next.goalAmount - rawProgress)
    progressPct = next.goalAmount > 0 ? Math.min(100, (progressAmount / next.goalAmount) * 100) : 100
  }

  const ASSIGNED_REQUIREMENT = [{ label: 'Asignación del mentor', value: 'Nivel inicial', met: true }]

  const perLevel = sorted.map((level) => {
    const completed = completedById.get(level.id) ?? false
    const state: 'completado' | 'en_curso' | 'bloqueado' = completed
      ? 'completado'
      : next !== null && level.id === next.id
        ? 'en_curso'
        : 'bloqueado'
    if (level.position < startPosition) {
      return { level, state, requirements: ASSIGNED_REQUIREMENT }
    }
    const { previousCumulative } = cumulativeGoals.get(level.id)!
    return {
      level,
      state,
      requirements: buildRequirements(level, previousCumulative, summary, drawdown, grantedLevelIds, moneyNet),
    }
  })

  return { current, next, progressPct, progressAmount, missingAmount, perLevel }
}
