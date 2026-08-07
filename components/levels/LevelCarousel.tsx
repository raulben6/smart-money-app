import { money } from '@/lib/format'
import type { LevelStatus } from '@/lib/metrics/levels'

/**
 * Carrusel de las 5 tarjetas de nivel de `/mi-nivel` (mockup líneas 335-343, estilos
 * 799-809): completado en verde (`--pos`), en curso con borde/fondo accent (con el % del
 * mismo `status.progressPct` que `LevelProgressCard`, ya que solo puede haber UN nivel
 * `en_curso` a la vez — el que `computeLevelStatus` marca como `next`), bloqueado con
 * 55% de opacidad. `goal` es 'Generar {money(goalAmount)}', salvo en niveles de
 * desbloqueo manual, donde se muestra el propio nombre del nivel (resolución del
 * controlador F2-T15) en vez de una meta monetaria que no aplica igual.
 */
export function LevelCarousel({ status }: { status: LevelStatus }) {
  return (
    <div className="flex flex-wrap gap-[12px]">
      {status.perLevel.map(({ level, state }) => {
        const isDone = state === 'completado'
        const isCurrent = state === 'en_curso'

        const stateColor = isDone ? 'var(--pos)' : isCurrent ? 'var(--color-accent-200)' : 'var(--color-neutral-500)'
        const stateText = isDone ? 'Completado' : isCurrent ? `En curso · ${Math.round(status.progressPct)}%` : 'Bloqueado'
        const goalText = level.manualUnlock ? level.name : `Generar ${money(level.goalAmount)}`

        return (
          <div
            key={level.id}
            className="flex flex-col gap-[5px]"
            style={{
              flex: '1',
              minWidth: '170px',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isCurrent ? 'var(--color-accent)' : 'var(--color-neutral-800)'}`,
              background: isCurrent ? 'var(--color-accent-900)' : 'transparent',
              opacity: state === 'bloqueado' ? 0.55 : 1,
            }}
          >
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '13px' }}>{level.name}</span>
            <span className="text-[11.5px] text-neutral-400">{goalText}</span>
            <span className="text-[11px] tabular-nums" style={{ color: stateColor }}>
              {stateText}
            </span>
          </div>
        )
      })}
    </div>
  )
}
