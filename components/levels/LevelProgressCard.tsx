import { money, pct } from '@/lib/format'
import type { LevelDef, LevelStatus } from '@/lib/metrics/levels'

/**
 * 'Objetivo del nivel: ...' (mockup línea 315): 'generar {money}' seguido de los gates
 * que el nivel realmente exige (PF/trades/drawdown/desbloqueo manual) — un nivel sin esa
 * regla (null/false) no la menciona, mismo criterio que `buildRequirements` en
 * `lib/metrics/levels.ts` (no se importa esa función, que no es pública — se reconstruye
 * el texto aquí a partir de los campos crudos del nivel). Exportada para que
 * `CalendarView` (banner del calendario del estudiante, Task 15) reutilice la MISMA
 * redacción sin duplicarla.
 */
export function levelGoalText(level: LevelDef): string {
  const base = `generar ${money(level.goalAmount)}`
  const gates: string[] = []
  if (level.minProfitFactor !== null) gates.push(`Profit Factor sostenido sobre ${level.minProfitFactor.toFixed(2)}`)
  if (level.minTrades !== null) gates.push(`al menos ${level.minTrades} operaciones`)
  if (level.maxDrawdownPct !== null) gates.push(`drawdown máximo de ${pct(level.maxDrawdownPct)}`)
  if (level.manualUnlock) gates.push('desbloqueo manual del mentor')

  return gates.length === 0 ? base : `${base} con ${gates.join(' y ')}`
}

/**
 * Entrada de `perLevel` del nivel EN CURSO: `next` si existe (siempre 'en_curso' según
 * `computeLevelStatus`), o `current` si ya no hay `next` (el alumno completó el último
 * nivel definido) — resolución del controlador F2-T15. `null` solo en el caso degenerado
 * sin niveles definidos (`perLevel` vacío). Exportada por el mismo motivo que
 * `levelGoalText`: el banner del calendario necesita localizar la misma entrada.
 */
export function focusPerLevel(status: LevelStatus) {
  const targetId = status.next?.id ?? status.current?.id
  if (!targetId) return null
  return status.perLevel.find((p) => p.level.id === targetId) ?? null
}

/**
 * Tarjeta grande de progreso de `/mi-nivel` (mockup líneas 310-333): número del nivel en
 * curso con badge glow, nombre, 'Objetivo del nivel: ...', % completado grande, barra y
 * grid de requisitos (`met` -> `--pos`, pendiente -> neutral). Server component puro —
 * `status` llega ya calculado por la página con `computeLevelStatus` (nunca se recalcula
 * aquí, evita duplicar la lógica de negocio).
 *
 * Cuando el alumno ya completó el último nivel (`status.next === null`), muestra ESE
 * nivel (`current`) como 100% completado en vez de dejar la tarjeta vacía.
 */
export function LevelProgressCard({ status }: { status: LevelStatus }) {
  const focus = focusPerLevel(status)

  if (!focus) {
    return (
      <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
        <h2 style={{ margin: 0, fontSize: '16px' }}>Aún no hay niveles configurados</h2>
        <p className="m-0 text-[13px] text-neutral-400">Tu mentor todavía no definió los niveles del programa.</p>
      </div>
    )
  }

  const { level, state, requirements } = focus
  const allDone = state === 'completado'
  const displayPct = allDone ? 100 : Math.round(status.progressPct)

  return (
    <div className="card" style={{ padding: '22px 24px', gap: '18px', maxWidth: '920px' }}>
      <div className="flex items-center gap-[16px]">
        <div
          className="flex flex-none items-center justify-center tabular-nums"
          style={{
            width: '58px',
            height: '58px',
            borderRadius: '14px',
            border: '1px solid var(--color-accent)',
            fontFamily: 'var(--font-heading)',
            fontSize: '22px',
            boxShadow: '0 0 26px -8px var(--color-accent)',
          }}
        >
          {level.position}
        </div>
        <div className="flex flex-col gap-[4px]">
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '17px' }}>{level.name}</span>
          <span className="text-[12px] text-neutral-400">
            {allDone ? 'Completaste este nivel' : `Objetivo del nivel: ${levelGoalText(level)}`}
          </span>
        </div>
        <div className="ml-auto text-right">
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '24px' }} className="tabular-nums">
            {displayPct}%
          </div>
          <div className="text-[11px] text-neutral-500">completado</div>
        </div>
      </div>

      <div className="h-[8px] overflow-hidden rounded-[5px]" style={{ background: 'var(--color-neutral-800)' }}>
        <div
          style={{
            width: `${displayPct}%`,
            height: '100%',
            borderRadius: '5px',
            background: 'linear-gradient(90deg, var(--color-accent-600), var(--color-accent))',
            transition: 'width .5s ease',
          }}
        />
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {requirements.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-[5px]"
            style={{ border: '1px solid var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: '13px 15px' }}
          >
            <span className="text-[11.5px] text-neutral-400">{r.label}</span>
            <span className="text-[14px] tabular-nums" style={{ color: r.met ? 'var(--pos)' : 'var(--color-neutral-400)' }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
