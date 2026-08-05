import Link from 'next/link'
import type { DbGoal } from '@/lib/db/schema'
import { formatLongDate, money, pct } from '@/lib/format'

export type GoalStatus = 'cumplido' | 'en_curso' | 'en_riesgo' | 'vencido'

const STATUS_LABEL: Record<GoalStatus, string> = {
  cumplido: 'Cumplido',
  en_riesgo: 'En riesgo',
  vencido: 'Vencido',
  en_curso: 'En curso',
}

/**
 * `current`/`target` -> texto mostrado en la tarjeta, según `kind` (resolución del
 * controlador F2-T14): ganancia usa `money`; operaciones un entero plano; win_rate y
 * manual un porcentaje (`pct`, sin decimales); riesgo_diario cuenta días de racha. El
 * target de `manual` SIEMPRE se muestra como '100%' literal (no `goal.targetValue`) —
 * ese kind trata `manualProgress` como un valor 0-100 ya expresado como avance directo
 * sobre el 100%, igual que en el mockup (no hay un "target" propio que mostrar).
 */
export function formatGoalProgress(
  kind: DbGoal['kind'],
  current: number,
  target: number,
): { currentDisplay: string; targetDisplay: string } {
  switch (kind) {
    case 'ganancia':
      return { currentDisplay: money(current), targetDisplay: money(target) }
    case 'operaciones':
      return { currentDisplay: String(Math.round(current)), targetDisplay: String(Math.round(target)) }
    case 'win_rate':
      return { currentDisplay: pct(current), targetDisplay: pct(target) }
    case 'riesgo_diario': {
      const dias = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'día' : 'días'}`
      return { currentDisplay: dias(current), targetDisplay: dias(target) }
    }
    case 'manual':
      return { currentDisplay: pct(current), targetDisplay: '100%' }
  }
}

/**
 * Tarjeta de objetivo (mockup líneas 279-306, estilos 787-791): nombre + tag de estado,
 * descripción, barra de progreso, '{current} de {target}' + '{pct}%', 'Vence {fecha}' y
 * — solo si `editable` — un botón Editar que navega a `editHref` (la página mentor lo
 * fija a `?e=<studentId>&editar=<goalId>`, ver `GoalForm`). Server component puro: no
 * hay estado ni interactividad propia, solo un `<Link>` para Editar.
 *
 * `progressPct`/`currentDisplay`/`targetDisplay` llegan ya calculados por el caller
 * (`computeGoalProgress` + `formatGoalProgress` de este mismo módulo) — la tarjeta solo
 * los pinta, no repite la lógica de negocio.
 */
export function GoalCard({
  goal,
  status,
  progressPct,
  currentDisplay,
  targetDisplay,
  editable,
  editHref,
}: {
  goal: Pick<DbGoal, 'id' | 'name' | 'description' | 'dueDate'>
  status: GoalStatus
  progressPct: number
  currentDisplay: string
  targetDisplay: string
  editable: boolean
  editHref?: string
}) {
  // Rojo (sin gradiente, igual que el mockup línea 789) para en_riesgo/vencido — el
  // resto (cumplido/en_curso) comparte la misma barra de acento en gradiente: Cumplido
  // NO pinta la barra en verde, solo su tag lo hace (ver `tagColor` abajo).
  const atRisk = status === 'en_riesgo' || status === 'vencido'
  const barBackground = atRisk ? 'var(--neg)' : 'linear-gradient(90deg, var(--color-accent-600), var(--color-accent))'

  const tagColor = status === 'cumplido' ? 'var(--pos)' : atRisk ? 'var(--neg)' : 'var(--color-neutral-400)'
  const tagBorder =
    status === 'cumplido'
      ? 'color-mix(in oklab, var(--pos) 45%, transparent)'
      : atRisk
        ? 'color-mix(in oklab, var(--neg) 45%, transparent)'
        : 'var(--color-neutral-700)'

  return (
    <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
      <div className="flex items-baseline gap-[10px]">
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '14px' }}>{goal.name}</span>
        <span
          className="tag"
          style={{ fontSize: '10px', marginLeft: 'auto', border: `1px solid ${tagBorder}`, color: tagColor, background: 'transparent' }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {goal.description ? (
        <p className="m-0 text-[12px] text-neutral-400" style={{ lineHeight: 1.5 }}>
          {goal.description}
        </p>
      ) : null}

      <div className="flex flex-col gap-[7px]">
        <div className="h-[6px] overflow-hidden rounded-[4px]" style={{ background: 'var(--color-neutral-800)' }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: '4px',
              background: barBackground,
              transition: 'width .5s ease',
            }}
          />
        </div>
        <div className="flex text-[11.5px] text-neutral-500 tabular-nums">
          <span>
            {currentDisplay} de {targetDisplay}
          </span>
          <span className="ml-auto text-neutral-300">{Math.round(progressPct)}%</span>
        </div>
      </div>

      <div
        className="flex items-center gap-[12px] text-[11px] text-neutral-500"
        style={{ borderTop: '1px solid var(--color-neutral-800)', paddingTop: '10px' }}
      >
        <span>Vence {formatLongDate(goal.dueDate)}</span>
        {editable && editHref ? (
          <Link href={editHref} className="btn btn-ghost ml-auto" style={{ fontSize: '11px', padding: '3px 8px' }}>
            Editar
          </Link>
        ) : null}
      </div>
    </div>
  )
}
