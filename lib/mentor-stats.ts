import type { Db } from '@/lib/db/queries/trades'
import type { DbUser } from '@/lib/db/schema'
import { listStudents, listTradesForStudent } from '@/lib/db/queries/mentor'
import { listLevels, listGrantIdsForUser } from '@/lib/db/queries/levels'
import { computeSummary } from '@/lib/metrics/summary'
import { equityPoints } from '@/lib/metrics/equity'
import { maxDrawdownPct, computeLevelStatus } from '@/lib/metrics/levels'
import type { Summary } from '@/lib/metrics/types'
import { isValidUuid } from '@/lib/validation/uuid'

/**
 * Métricas de UN estudiante ya resueltas para las vistas de mentor (`/panel`,
 * `/comparador`) — composición server-only de queries (`lib/db/queries/*`) +
 * métricas puras (`lib/metrics/*`), por eso vive aquí y no en `lib/metrics`
 * (que no toca la base de datos). Los ratios llegan sin redondear ni formatear
 * — money/pct/toFixed son responsabilidad de cada página/componente.
 */
export type StudentStats = {
  student: DbUser
  summary: Summary
  /** Máximo drawdown pico-a-valle, en % positivo (0 si no hay caída). */
  dd: number
  /** Rentabilidad sobre el capital inicial, en %; 0 si el estudiante no tiene `initialBalance` (aún no completó onboarding). */
  ret: number
  /** Nombre del nivel actual (`computeLevelStatus().current`), o 'Nivel 1' si todavía no completó ninguno. */
  levelName: string
  /** Media de `riskPct` sobre los trades que lo tienen definido; `null` si ninguno lo tiene. */
  avgRiskPct: number | null
  /** `tradeDate` más reciente del estudiante ('YYYY-MM-DD'), o `null` si no tiene trades — insumo de "activos esta semana". */
  lastTradeDate: string | null
}

/**
 * Combina `listStudents`/`listTradesForStudent`/`listLevels`/`listGrantIdsForUser` con
 * `computeSummary`/`equityPoints`/`maxDrawdownPct`/`computeLevelStatus` para dar, por cada
 * estudiante del mentor, las métricas que consumen tanto `/panel` (Task 13) como
 * `/comparador` (misma tarea) — evita que ambas páginas dupliquen la misma composición.
 *
 * N+1 aceptable (Promise.all sobre pocos alumnos por mentor, resolución del controlador
 * F2-T13) — cada estudiante dispara sus propias `listTradesForStudent`/`listGrantIdsForUser`
 * en paralelo entre estudiantes.
 */
export async function loadStudentStats(db: Db, mentorId: string): Promise<StudentStats[]> {
  const [students, levels] = await Promise.all([listStudents(db, mentorId), listLevels(db)])

  return Promise.all(
    students.map(async (student): Promise<StudentStats> => {
      const [trades, grantedLevelIds] = await Promise.all([
        listTradesForStudent(db, mentorId, student.id),
        listGrantIdsForUser(db, student.id),
      ])

      const initialBalance = student.initialBalance ?? 0
      const summary = computeSummary(trades, initialBalance)
      const dd = maxDrawdownPct(equityPoints(trades, initialBalance).map((p) => p.balance))
      const ret = initialBalance ? (summary.netPnl / initialBalance) * 100 : 0
      const levelStatus = computeLevelStatus({ trades, initialBalance, levels, grantedLevelIds })

      const risks = trades.map((t) => t.riskPct).filter((r): r is number => r !== null)
      const avgRiskPct = risks.length === 0 ? null : risks.reduce((a, b) => a + b, 0) / risks.length

      const lastTradeDate = trades.reduce<string | null>(
        (max, t) => (max === null || t.tradeDate > max ? t.tradeDate : max),
        null,
      )

      return {
        student,
        summary,
        dd,
        ret,
        levelName: levelStatus.current?.name ?? 'Nivel 1',
        avgRiskPct,
        lastTradeDate,
      }
    }),
  )
}

/**
 * true si `dateISO` ('YYYY-MM-DD') cae en la ventana de `days` días terminando en
 * `todayISO` (ambos extremos inclusive) — p.ej. days=7 cubre [hoy-6, hoy]. Se construye
 * el corte con partes locales de `Date` (nunca aritmética sobre el string ni
 * `toISOString`, que puede desplazar el día en zonas horarias negativas), mismo patrón
 * que `DashboardView.toYmd`.
 */
function withinLastDays(dateISO: string, todayISO: string, days: number): boolean {
  const [y, m, d] = todayISO.split('-').map(Number)
  const cutoff = new Date(y, m - 1, d - (days - 1))
  const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  return dateISO >= cutoffISO && dateISO <= todayISO
}

export type PanelSummary = {
  studentCount: number
  /** Estudiantes con al menos un trade en los últimos 7 días (incluyendo hoy). */
  activeCount: number
  /** Media de `ret` sobre todos los estudiantes (0 si `studentCount` es 0). */
  avgReturnPct: number
  /** Media de `winRate` sobre los estudiantes que lo tienen definido (con trades); `null` si ninguno. */
  avgWinRate: number | null
  /** Media de `profitFactor` sobre los estudiantes que lo tienen definido; `null` si ninguno. */
  avgProfitFactor: number | null
  /** Estudiantes con Profit Factor < 1 O rentabilidad negativa. */
  alertCount: number
  /** El primero de esos estudiantes en el orden de `stats` (el de `listStudents`), o `null` si no hay ninguno. */
  firstAlert: { name: string; profitFactor: number | null } | null
}

/**
 * Agregados de las 5 tarjetas de `/panel` (mockup líneas 811-817) a partir de las
 * `StudentStats` ya cargadas. Función pura — `todayISO` llega por parámetro
 * (`todayLocalISO()` en la página), nunca `Date.now()` aquí.
 */
export function computePanelSummary(stats: StudentStats[], todayISO: string): PanelSummary {
  const studentCount = stats.length
  const activeCount = stats.filter((s) => s.lastTradeDate !== null && withinLastDays(s.lastTradeDate, todayISO, 7)).length

  const avgReturnPct = studentCount === 0 ? 0 : stats.reduce((sum, s) => sum + s.ret, 0) / studentCount

  const winRates = stats.map((s) => s.summary.winRate).filter((w): w is number => w !== null)
  const avgWinRate = winRates.length === 0 ? null : winRates.reduce((a, b) => a + b, 0) / winRates.length

  const profitFactors = stats.map((s) => s.summary.profitFactor).filter((p): p is number => p !== null)
  const avgProfitFactor = profitFactors.length === 0 ? null : profitFactors.reduce((a, b) => a + b, 0) / profitFactors.length

  const alerts = stats.filter((s) => (s.summary.profitFactor !== null && s.summary.profitFactor < 1) || s.ret < 0)
  const firstAlert = alerts.length === 0 ? null : { name: alerts[0].student.name, profitFactor: alerts[0].summary.profitFactor }

  return { studentCount, activeCount, avgReturnPct, avgWinRate, avgProfitFactor, alertCount: alerts.length, firstAlert }
}

/**
 * Resuelve qué estudiantes están seleccionados en `/comparador` a partir del parámetro
 * de URL `?s=id1,id2,...`. Filtra a uuids con forma válida que además correspondan a un
 * estudiante real de `stats` — un id ajeno, repetido o malformado no debe colarse.
 *
 * Si el resultado queda vacío (parámetro ausente, vacío, o ningún id sobrevive el
 * filtro) aplica el default del controlador: todos los estudiantes si hay ≤3, o los
 * primeros 3 en el orden de `stats` (el de `listStudents`, createdAt ascendente) si hay
 * más.
 */
export function resolveComparedIds(stats: StudentStats[], raw: string | undefined): string[] {
  const validIds = new Set(stats.map((s) => s.student.id))
  const requested = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => isValidUuid(id) && validIds.has(id))

  const selected = [...new Set(requested)]
  if (selected.length > 0) return selected

  return stats.length <= 3 ? stats.map((s) => s.student.id) : stats.slice(0, 3).map((s) => s.student.id)
}
