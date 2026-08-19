import Link from 'next/link'
import { requireMentor } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { loadStudentStats, computePanelSummary } from '@/lib/mentor-stats'
import { pct } from '@/lib/format'
import { todayAppISO } from '@/lib/app-time'
import { PageHeader } from '@/components/shell/PageHeader'
import { RankingTable } from '@/components/mentor/RankingTable'

/**
 * Panel general del mentor (Task 13 de Fase 2, mockup líneas 346-377): 5 tarjetas de
 * métricas agregadas del grupo + ranking de estudiantes. `loadStudentStats` resuelve el
 * N+1 (trades por alumno) con `Promise.all` — aceptable con pocos alumnos por mentor
 * (resolución del controlador). Sin estudiantes, se muestra un estado vacío con CTA a
 * `/invitaciones` en vez de tarjetas/tabla vacías.
 */
export default async function PanelPage() {
  const mentor = await requireMentor()
  const db = getDb()
  const stats = await loadStudentStats(db, mentor.id)

  if (stats.length === 0) {
    return (
      <>
        <PageHeader title="Panel general" subtitle="Cómo va el grupo completo de estudiantes" />
        <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
          <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no tienes estudiantes</h2>
            <p className="m-0 text-[13px] text-neutral-400">
              Invita a tu primer estudiante para empezar a ver su progreso aquí.
            </p>
            <Link href="/invitaciones" className="btn btn-primary" style={{ marginTop: '8px' }}>
              Invitar estudiante
            </Link>
          </div>
        </div>
      </>
    )
  }

  const summary = computePanelSummary(stats, todayAppISO())

  const cards: { label: string; value: string; sub: string; colorClassName?: string }[] = [
    {
      label: 'Estudiantes',
      value: String(summary.studentCount),
      sub: `${summary.activeCount} activos esta semana`,
    },
    {
      label: 'Rentabilidad promedio',
      value: `${summary.avgReturnPct >= 0 ? '+' : ''}${summary.avgReturnPct.toFixed(1)}%`,
      sub: 'sobre capital inicial',
      colorClassName: summary.avgReturnPct >= 0 ? 'text-pos' : 'text-neg',
    },
    {
      label: 'Win Rate promedio',
      value: summary.avgWinRate === null ? '—' : pct(summary.avgWinRate, 0),
      sub: 'promedio del grupo',
    },
    {
      label: 'Profit Factor promedio',
      value: summary.avgProfitFactor === null ? '—' : summary.avgProfitFactor.toFixed(2),
      sub: 'meta del grupo: 2.00',
    },
    {
      label: 'Requieren atención',
      value: String(summary.alertCount),
      sub: summary.firstAlert
        ? `${summary.firstAlert.name} · PF ${summary.firstAlert.profitFactor === null ? '—' : summary.firstAlert.profitFactor.toFixed(2)}`
        : 'Sin alertas',
      colorClassName: summary.alertCount > 0 ? 'text-neg' : 'text-pos',
    },
  ]

  return (
    <>
      <PageHeader title="Panel general" subtitle="Cómo va el grupo completo de estudiantes" />
      <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
        {/* 2 columnas en móvil (fase 3 responsive): el auto-fit apilaba las 5
            tarjetas a una columna en teléfonos y el ranking quedaba 3 pantallas
            abajo. En ≥1024 vuelve el auto-fit original (5 en línea si caben). */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          {cards.map((card) => (
            <div key={card.label} className="card" style={{ padding: '16px 17px', gap: '8px' }}>
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-neutral-500">{card.label}</span>
              <span
                className={`text-[24px] leading-none tabular-nums ${card.colorClassName ?? 'text-text'}`}
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
              >
                {card.value}
              </span>
              <span className="text-[11.5px] text-neutral-400">{card.sub}</span>
            </div>
          ))}
        </div>

        <RankingTable stats={stats} />
      </div>
    </>
  )
}
