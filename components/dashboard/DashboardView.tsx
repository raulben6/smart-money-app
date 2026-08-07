import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DbTrade } from '@/lib/db/schema'
import { computeSummary } from '@/lib/metrics/summary'
import { equityPoints, buildLinePath } from '@/lib/metrics/equity'
import { monthlyAggregates } from '@/lib/metrics/periods'
import { formatDayMonth } from '@/lib/format'
import { todayAppISO } from '@/lib/app-time'
import { PageHeader } from '@/components/shell/PageHeader'
import { HeroStats } from '@/components/dashboard/HeroStats'
import { EquityCurve } from '@/components/dashboard/EquityCurve'
import { WinRateDonut } from '@/components/dashboard/WinRateDonut'
import { QualityStats } from '@/components/dashboard/QualityStats'
import { MonthlyBars } from '@/components/dashboard/MonthlyBars'
import { RecentTrades } from '@/components/dashboard/RecentTrades'

const EQUITY_WINDOW_DAYS = 30

/** 'YYYY-MM-DD' con partes de fecha locales (nunca toISOString, que desplaza el día en zonas negativas). */
function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Últimos `n` meses calendario (incluye el actual), más antiguo primero. */
function lastMonths(n: number, now: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

/**
 * `basePath` (que siempre termina en '/dashboard') -> la ruta del calendario equivalente,
 * por reemplazo de sufijo: '/dashboard' -> '/calendario' para el propio alumno,
 * '/estudiantes/{id}/dashboard' -> '/estudiantes/{id}/calendario' para la vista de mentor
 * (Task 12) — ambos grupos de rutas ((app) y (mentor)) espejan dashboard/calendario 1:1
 * bajo el mismo prefijo, así que no hace falta un prop aparte para esto.
 */
function calendarPathFor(basePath: string): string {
  return basePath.replace(/\/dashboard$/, '/calendario')
}

/**
 * Cuerpo de `/dashboard` (Task 13 de Fase 1), extraído a un componente compartido para que
 * el mentor pueda ver exactamente la misma vista, en modo solo lectura, de cualquier alumno
 * (Task 12 de Fase 2 — ver `app/(mentor)/estudiantes/[id]/dashboard/page.tsx`).
 *
 * `readOnly` oculta las entradas de creación ('+ Registrar trade' del header, la del estado
 * vacío) — un mentor nunca crea operaciones. `basePath` alimenta TODOS los enlaces internos
 * (los de `RecentTrades` hacia `?trade=`, y el propio CTA hacia `?nuevo=` del calendario
 * equivalente) para que funcionen igual bajo `/dashboard` (alumno) que bajo
 * `/estudiantes/[id]/dashboard` (mentor). `headerActions` es el hueco donde la página mentor
 * monta `StudentPicker` (Task 12) — `undefined` en las páginas de alumno, sin efecto visual.
 */
export function DashboardView({
  trades,
  initialBalance,
  displayName,
  readOnly,
  basePath,
  headerActions,
}: {
  trades: DbTrade[]
  initialBalance: number
  displayName: string
  readOnly: boolean
  basePath: string
  headerActions?: ReactNode
}) {
  const calendarPath = calendarPathFor(basePath)
  const title = readOnly ? displayName : `Hola, ${displayName}`
  const subtitle = readOnly ? 'Dashboard del estudiante · mismo detalle que ve el alumno' : 'Así va tu cuenta este mes.'

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        {headerActions}
        {!readOnly && (
          <Link href={`${calendarPath}?nuevo=1`} className="btn btn-secondary">
            + Registrar trade
          </Link>
        )}
      </PageHeader>

      {/* F2-T15: banner de progreso de nivel del estudiante (solo cuando !readOnly) — esta tarea deja el hueco, no lo implementa. */}

      {trades.length === 0 ? (
        <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>
              {readOnly ? 'Este alumno aún no registra operaciones' : 'Aún no registras operaciones'}
            </h2>
            <p className="m-0 text-[13px] text-neutral-400">
              {readOnly
                ? 'Sus métricas y curva de crecimiento aparecerán aquí en cuanto registre su primera operación.'
                : 'Registra tu primera operación para ver tus métricas y tu curva de crecimiento aquí.'}
            </p>
            {readOnly ? (
              // Sin trades, el enlace 'Ver calendario' normal de `RecentTrades` no se llega a
              // renderizar (esa card ni existe en el estado vacío) — este es el único camino
              // hacia el calendario del alumno desde aquí (fix de navegación, smoke test).
              <Link href={calendarPath} className="btn btn-ghost" style={{ marginTop: '8px' }}>
                Ver calendario
              </Link>
            ) : (
              <Link href={`${calendarPath}?nuevo=1`} className="btn btn-primary" style={{ marginTop: '8px' }}>
                Registrar mi primera operación
              </Link>
            )}
          </div>
        </div>
      ) : (
        <DashboardBody trades={trades} initialBalance={initialBalance} basePath={basePath} calendarHref={calendarPath} />
      )}
    </>
  )
}

function DashboardBody({
  trades,
  initialBalance,
  basePath,
  calendarHref,
}: {
  trades: DbTrade[]
  initialBalance: number
  basePath: string
  calendarHref: string
}) {
  const summary = computeSummary(trades, initialBalance)
  // Anclado al día calendario del PROGRAMA (auditoría final: `new Date()` a
  // secas usa la hora del proceso — UTC en producción — y corría las ventanas
  // de 30 días y de meses 6 horas; mismo defecto raíz que la ronda 13).
  const [ty, tm, td] = todayAppISO().split('-').map(Number)
  const now = new Date(ty, tm - 1, td)

  // Curva de equity: últimos 30 días; si no hay trades en la ventana, se usan todos.
  const windowStart = toYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (EQUITY_WINDOW_DAYS - 1)))
  const windowTrades = trades.filter((t) => t.tradeDate >= windowStart)
  const equitySource = windowTrades.length > 0 ? windowTrades : trades
  const priorTrades = windowTrades.length > 0 ? trades.filter((t) => t.tradeDate < windowStart) : []
  const equityBaseline = computeSummary(priorTrades, initialBalance).balance

  const points = equityPoints(equitySource, equityBaseline)
  const { line, area } = buildLinePath(points.map((p) => p.balance), 720, 220)
  const periodNet = computeSummary(equitySource, equityBaseline).netPnl
  const ticks: [string, string, string] = [
    formatDayMonth(points[0]?.date ?? ''),
    formatDayMonth(points[Math.floor((points.length - 1) / 2)]?.date ?? ''),
    formatDayMonth(points[points.length - 1]?.date ?? ''),
  ]

  const months = monthlyAggregates(trades, lastMonths(8, now))
  const recent = trades.slice(0, 6)

  return (
    <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
      <HeroStats summary={summary} initialBalance={initialBalance} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <EquityCurve areaPath={area} linePath={line} ticks={ticks} periodNet={periodNet} />

        <div className="card" style={{ padding: '18px 20px', gap: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '14px' }}>Calidad de la operativa</h2>
          <WinRateDonut winRate={summary.winRate} wins={summary.wins} losses={summary.losses} />
          <QualityStats summary={summary} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="card" style={{ padding: '18px 20px', gap: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '14px' }}>Rendimiento mensual</h2>
          <MonthlyBars months={months} />
        </div>

        <RecentTrades trades={recent} basePath={basePath} calendarHref={calendarHref} />
      </div>
    </div>
  )
}
