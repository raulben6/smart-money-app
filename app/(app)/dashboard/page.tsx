import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { listTrades } from '@/lib/db/queries/trades'
import type { DbTrade } from '@/lib/db/schema'
import { computeSummary } from '@/lib/metrics/summary'
import { equityPoints, buildLinePath } from '@/lib/metrics/equity'
import { monthlyAggregates } from '@/lib/metrics/periods'
import { PageHeader } from '@/components/shell/PageHeader'
import { HeroStats } from '@/components/dashboard/HeroStats'
import { EquityCurve } from '@/components/dashboard/EquityCurve'
import { WinRateDonut } from '@/components/dashboard/WinRateDonut'
import { QualityStats } from '@/components/dashboard/QualityStats'
import { MonthlyBars } from '@/components/dashboard/MonthlyBars'
import { RecentTrades } from '@/components/dashboard/RecentTrades'

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const EQUITY_WINDOW_DAYS = 30

/** 'YYYY-MM-DD' con partes de fecha locales (nunca toISOString, que desplaza el día en zonas negativas). */
function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** '2026-08-01' -> '1 ago'. */
function formatTick(ymd: string): string {
  if (!ymd) return ''
  const [, month, day] = ymd.split('-').map(Number)
  return `${day} ${MONTHS_ES[month - 1]}`
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

export default async function DashboardPage() {
  const user = await requireUser()
  const initialBalance = user.initialBalance!

  const db = getDb()
  const trades = await listTrades(db, user.id)

  return (
    <>
      <PageHeader title={`Hola, ${user.name}`} subtitle="Así va tu cuenta este mes.">
        <Link href="/calendario?nuevo=1" className="btn btn-secondary">
          + Registrar trade
        </Link>
      </PageHeader>

      {trades.length === 0 ? (
        <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no registras operaciones</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Registra tu primera operación para ver tus métricas y tu curva de crecimiento aquí.
            </p>
            <Link href="/calendario?nuevo=1" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Registrar mi primera operación
            </Link>
          </div>
        </div>
      ) : (
        <DashboardBody trades={trades} initialBalance={initialBalance} />
      )}
    </>
  )
}

function DashboardBody({
  trades,
  initialBalance,
}: {
  trades: DbTrade[]
  initialBalance: number
}) {
  const summary = computeSummary(trades, initialBalance)
  const now = new Date()

  // Curva de equity: últimos 30 días; si no hay trades en la ventana, se usan todos.
  const windowStart = toYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (EQUITY_WINDOW_DAYS - 1)))
  const windowTrades = trades.filter((t) => t.tradeDate >= windowStart)
  const equitySource = windowTrades.length > 0 ? windowTrades : trades
  const priorTrades = windowTrades.length > 0 ? trades.filter((t) => t.tradeDate < windowStart) : []
  const equityBaseline = initialBalance + priorTrades.reduce((acc, t) => acc + t.pnlUsd, 0)

  const points = equityPoints(equitySource, equityBaseline)
  const { line, area } = buildLinePath(points.map((p) => p.balance), 720, 220)
  const periodNet = computeSummary(equitySource, equityBaseline).netPnl
  const ticks: [string, string, string] = [
    formatTick(points[0]?.date ?? ''),
    formatTick(points[Math.floor((points.length - 1) / 2)]?.date ?? ''),
    formatTick(points[points.length - 1]?.date ?? ''),
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

        <RecentTrades trades={recent} />
      </div>
    </div>
  )
}
