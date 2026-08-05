import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DbTrade } from '@/lib/db/schema'
import { calendarAggregates } from '@/lib/metrics/periods'
import { MONTH_NAMES_ES, money, pct } from '@/lib/format'
import type { LevelStatus } from '@/lib/metrics/levels'
import { levelGoalText } from '@/components/levels/LevelProgressCard'
import { PageHeader } from '@/components/shell/PageHeader'
import { MonthGrid } from '@/components/calendar/MonthGrid'
import { MonthSummary } from '@/components/calendar/MonthSummary'
import { DayTradesPanel } from '@/components/calendar/DayTradesPanel'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Año/mes válidos desde `searchParams` (enteros, año 2000-2100, mes 1-12); si faltan o son inválidos, el mes actual local. */
function resolveYearMonth(y: string | undefined, m: string | undefined): { year: number; month: number } {
  const now = new Date()
  const year = Number(y)
  const month = Number(m)
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12

  return {
    year: validYear ? year : now.getFullYear(),
    month: validMonth ? month : now.getMonth() + 1,
  }
}

/** Mes/año desplazados `delta` meses (±1), con acarreo de año. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/**
 * Datos del banner de nivel (Task 15): el `LevelStatus` ya calculado + `netPnl` real del
 * estudiante. `netPnl` viaja SEPARADO de `status` (en vez de derivarse de
 * `status.progressPct`, ver hallazgo de revisión abajo) porque `progressPct` está topado
 * en [0, 100] — reconstruir el monto que falta a partir de ese % topado entiende un
 * `netPnl` negativo como 0 y subestima drásticamente cuánto falta. `lib/metrics/levels.ts`
 * no se toca (no expone `netPnl` en `LevelStatus`): el caller (`app/(app)/calendario/page.tsx`)
 * ya tiene los trades y calcula `computeSummary(...).netPnl` por su cuenta.
 */
type LevelBannerData = { status: LevelStatus; netPnl: number }

/**
 * Banner de nivel sobre el calendario del ESTUDIANTE (mockup líneas 194-215): badge del
 * nivel EN CURSO (`status.next` — siempre 'en_curso' según `computeLevelStatus`), su
 * 'Objetivo del nivel: ...' en variante COMPACTA ('generar {money}', sin los demás gates —
 * esos ya se listan aparte en la línea 'Te faltan...'; la variante verbosa completa queda
 * para `LevelProgressCard`/`/mi-nivel`), barra de progreso y 'Te faltan {money}, N
 * operaciones, un Profit Factor sobre Y y/o reducir tu drawdown bajo Z% para pasar al
 * Nivel X' — SOLO se mencionan los gates que de verdad faltan, derivados de los propios
 * `requirements` del nivel en curso (`focus.requirements`, por label):
 *
 * - Dinero: `Math.max(0, next.goalAmount - netPnl)` con el `netPnl` REAL (nunca
 *   reconstruido desde `progressPct`, ver `LevelBannerData` arriba) — correcto también con
 *   `netPnl` negativo (p. ej. -$500 contra una meta de $1,000 → faltan $1,500).
 * - Operaciones: se lee el requisito 'Operaciones mínimas' con forma 'X / Y' cuando no
 *   está `met` (esa comparación no está topada como `progressPct`, así que parsearla sigue
 *   siendo exacta).
 * - Profit Factor / Drawdown / Desbloqueo del mentor: si el requisito correspondiente
 *   ('Profit Factor mínimo' / 'Drawdown máximo' / 'Desbloqueo del mentor') no está `met`,
 *   se añade su propia cláusula — antes se omitían por completo y el alumno solo veía el
 *   fallback genérico aunque el único gate pendiente fuera, p. ej., el Profit Factor.
 *
 * Si el alumno ya completó el último nivel (`status.next === null`), se muestra un
 * banner simple de felicitación en su lugar.
 */
function LevelBanner({ status, netPnl }: LevelBannerData) {
  const next = status.next

  if (!next) {
    return (
      <div className="card flex flex-wrap items-center gap-[14px]" style={{ padding: '15px 18px' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '13.5px' }}>
          Completaste todos los niveles del programa
        </span>
        <Link href="/mi-nivel" className="btn btn-ghost ml-auto" style={{ fontSize: '11.5px', padding: '6px 11px' }}>
          Ver mi nivel
        </Link>
      </div>
    )
  }

  const focus = status.perLevel.find((p) => p.level.id === next.id)
  if (!focus) return null

  const displayPct = Math.round(status.progressPct)
  const missingMoney = Math.max(0, next.goalAmount - netPnl)

  const tradesReq = focus.requirements.find((r) => r.label === 'Operaciones mínimas')
  const tradesMatch = tradesReq && !tradesReq.met ? tradesReq.value.match(/^(\d+) \/ (\d+)$/) : null
  const missingTrades = tradesMatch ? Math.max(0, Number(tradesMatch[2]) - Number(tradesMatch[1])) : 0

  const missingParts: string[] = []
  if (missingMoney > 0) missingParts.push(money(missingMoney))
  if (missingTrades > 0) missingParts.push(`${missingTrades} ${missingTrades === 1 ? 'operación' : 'operaciones'}`)

  const pfReq = focus.requirements.find((r) => r.label === 'Profit Factor mínimo')
  if (pfReq && !pfReq.met && next.minProfitFactor !== null) {
    missingParts.push(`un Profit Factor sobre ${next.minProfitFactor.toFixed(2)}`)
  }

  const ddReq = focus.requirements.find((r) => r.label === 'Drawdown máximo')
  if (ddReq && !ddReq.met && next.maxDrawdownPct !== null) {
    missingParts.push(`reducir tu drawdown bajo ${pct(next.maxDrawdownPct)}`)
  }

  const manualReq = focus.requirements.find((r) => r.label === 'Desbloqueo del mentor')
  if (manualReq && !manualReq.met) {
    missingParts.push('el desbloqueo manual del mentor')
  }

  const nextAfter = status.perLevel.find((p) => p.level.position === next.position + 1)?.level ?? null

  return (
    <div className="card flex flex-wrap items-center gap-[20px]" style={{ padding: '15px 18px' }}>
      <div className="flex flex-none items-center gap-[12px]">
        <div
          className="flex items-center justify-center tabular-nums"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            border: '1px solid var(--color-accent)',
            fontFamily: 'var(--font-heading)',
            fontSize: '15px',
            boxShadow: '0 0 18px -7px var(--color-accent)',
          }}
        >
          {next.position}
        </div>
        <div className="flex flex-col" style={{ lineHeight: 1.3 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '13.5px' }}>
            Nivel {next.position} · {next.name}
          </span>
          <span className="text-[11.5px] text-neutral-400">
            Objetivo del nivel: {levelGoalText(next, { compact: true })}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[7px]" style={{ minWidth: '220px' }}>
        <div className="flex text-[11.5px] text-neutral-500 tabular-nums">
          <span>
            {money(netPnl)} de {money(next.goalAmount)}
          </span>
          <span className="ml-auto text-neutral-300">{displayPct}%</span>
        </div>
        <div className="h-[7px] overflow-hidden rounded-[5px]" style={{ background: 'var(--color-neutral-800)' }}>
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
        <span className="text-[11px] text-neutral-500">
          {nextAfter === null
            ? 'Este es el último nivel definido — sigue así'
            : missingParts.length > 0
              ? `Te faltan ${missingParts.join(' y ')} para pasar al ${nextAfter.name}`
              : `Cumple el resto de requisitos del nivel para pasar al ${nextAfter.name}`}
        </span>
      </div>

      <Link href="/mi-nivel" className="btn btn-ghost flex-none" style={{ fontSize: '11.5px', padding: '6px 11px' }}>
        Ver mi nivel
      </Link>
    </div>
  )
}

/**
 * Cuerpo de `/calendario` (Fase 1), extraído a un componente compartido para que el mentor
 * pueda ver exactamente el mismo calendario, en modo solo lectura, de cualquier alumno
 * (Task 12 de Fase 2 — ver `app/(mentor)/estudiantes/[id]/calendario/page.tsx`).
 *
 * `y`/`m` llegan tal cual de `searchParams` (strings sin validar, ver `resolveYearMonth`).
 * `searchParams` trae el resto de query params relevantes para esta vista: `trade`/`nuevo`
 * deciden si el panel de día (`DayTradesPanel`) debe ceder ante el modal de trade (mismo
 * criterio de exclusión mutua que la página de Fase 1); `dia` abre ese panel. El modal en sí
 * (`TradeModalGate`) NO se monta aquí — lo monta la página (server component con el `viewer`
 * resuelto), como hermano de esta vista.
 *
 * `readOnly` oculta las entradas de creación ('+ Registrar trade' del header, '+ Registrar
 * en este día' del panel) y vuelve no interactivas las celdas de día sin operaciones (ver
 * `MonthGrid`). `basePath` alimenta TODOS los enlaces internos (`?dia=`, `?trade=`,
 * `?nuevo=`, mes anterior/siguiente) para que funcionen igual bajo `/calendario` (alumno)
 * que bajo `/estudiantes/[id]/calendario` (mentor). `headerActions` es el hueco donde la
 * página mentor monta `StudentPicker` (Task 12) — `undefined` en las páginas de alumno, sin
 * efecto visual. `levelBanner` (Task 15) es `{ status, netPnl }` del ESTUDIANTE (ver
 * `LevelBannerData`), calculado por `app/(app)/calendario/page.tsx` — las páginas del
 * mentor nunca lo pasan, así que el banner de nivel solo puede aparecer combinado con
 * `!readOnly` (el mentor jamás lo ve, ni siquiera si algún día se le pasara por error).
 */
export function CalendarView({
  trades,
  y,
  m,
  searchParams,
  readOnly,
  basePath,
  headerActions,
  levelBanner,
}: {
  trades: DbTrade[]
  y?: string
  m?: string
  searchParams: { trade?: string; nuevo?: string; fecha?: string; dia?: string }
  readOnly: boolean
  basePath: string
  headerActions?: ReactNode
  levelBanner?: LevelBannerData
}) {
  const { trade, nuevo, dia } = searchParams
  const { year, month } = resolveYearMonth(y, m)
  const { days, summary } = calendarAggregates(trades, year, month)

  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const monthLabel = `${MONTH_NAMES_ES[month - 1]} ${year}`

  // `?dia=` abre el panel de lista (DayTradesPanel) en vez del modal de trade — mutuamente
  // excluyentes con `trade`/`nuevo`: si cualquiera de esos dos está activo, gana el modal
  // (montado por la página, ver doc de arriba) y el panel no se renderiza, aunque `dia`
  // también venga en la URL.
  const diaValida = dia && FECHA_RE.test(dia) ? dia : null
  const showDayPanel = diaValida !== null && !trade && !nuevo
  const dayTrades = showDayPanel ? trades.filter((t) => t.tradeDate === diaValida) : []

  const subtitle = readOnly
    ? 'Revisa cada día operado y deja retroalimentación'
    : 'Haz clic en un día para registrar o revisar tus operaciones'

  return (
    <>
      <PageHeader title="Calendario de trading" subtitle={subtitle}>
        {headerActions}
        {!readOnly && (
          <Link href={`${basePath}?y=${year}&m=${month}&nuevo=1`} className="btn btn-secondary">
            + Registrar trade
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
        {!readOnly && levelBanner ? <LevelBanner status={levelBanner.status} netPnl={levelBanner.netPnl} /> : null}

        <div className="flex flex-wrap items-center gap-[14px]">
          <div className="flex items-center gap-[8px]">
            <Link
              href={`${basePath}?y=${prev.year}&m=${prev.month}`}
              aria-label="Mes anterior"
              className="btn btn-ghost btn-icon"
              style={{ width: '30px', height: '30px' }}
            >
              ‹
            </Link>
            <span
              className="min-w-[150px] text-center text-[15px]"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
            >
              {monthLabel}
            </span>
            <Link
              href={`${basePath}?y=${next.year}&m=${next.month}`}
              aria-label="Mes siguiente"
              className="btn btn-ghost btn-icon"
              style={{ width: '30px', height: '30px' }}
            >
              ›
            </Link>
          </div>

          <div className="ml-auto hidden gap-4 text-[11.5px] text-neutral-400 sm:flex">
            <span className="flex items-center gap-[6px]">
              <i
                style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--pos)', display: 'block' }}
              />
              Día positivo
            </span>
            <span className="flex items-center gap-[6px]">
              <i
                style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--neg)', display: 'block' }}
              />
              Día negativo
            </span>
            <span className="flex items-center gap-[6px]">
              <i
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  background: 'var(--color-neutral-700)',
                  display: 'block',
                }}
              />
              Sin operativa
            </span>
          </div>
        </div>

        <MonthGrid year={year} month={month} days={days} trades={trades} basePath={basePath} readOnly={readOnly} />

        <MonthSummary summary={summary} />
      </div>

      {showDayPanel && diaValida !== null ? (
        <DayTradesPanel
          dateISO={diaValida}
          trades={dayTrades}
          basePath={basePath}
          closeHref={`${basePath}?y=${year}&m=${month}`}
          registerHref={readOnly ? undefined : `${basePath}?y=${year}&m=${month}&nuevo=1&fecha=${diaValida}`}
        />
      ) : null}
    </>
  )
}
