import { getDb } from '@/lib/db'
import { requireUser, requireMentor } from '@/lib/auth'
import { getTradeDetail } from '@/lib/db/queries/trades'
import { getTradeDetailForStudent } from '@/lib/db/queries/mentor'
import { isValidUuid } from '@/lib/validation/uuid'
import { todayAppISO } from '@/lib/app-time'
import { TradeModal, type EditableTrade } from './TradeModal'
import { EMPTY_JOURNAL, type CapturePhase, type ExistingCapture, type JournalFormState } from './JournalSection'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Quién mira el modal (Task 12): el propio dueño de los trades (`'owner'`), o un mentor
 * viendo — solo lectura — los de un estudiante concreto (`'mentor'`). En modo mentor, `?nuevo`
 * se IGNORA por completo (un mentor no crea operaciones a nombre de su alumno) y el detalle
 * se resuelve con `getTradeDetailForStudent` en vez de `getTradeDetail`.
 */
export type TradeModalViewer = { mode: 'owner' } | { mode: 'mentor'; studentId: string }

/**
 * Puerta de entrada del modal de operación: server component que decide, a partir de los
 * `searchParams` de la página que lo monta, si se muestra en modo edición (`?trade=<uuid>`,
 * cargando el detalle con su propia consulta a la base de datos), creación (`?nuevo=1`, con
 * `?fecha=` opcional — si falta o no tiene forma de fecha válida, hoy local) o nada.
 *
 * Se monta tanto en `/dashboard`/`/calendario` (alumno) como en sus equivalentes de mentor
 * `/estudiantes/[id]/dashboard`/`/estudiantes/[id]/calendario` (Task 12). No recibe el
 * usuario ya resuelto como prop: llama a `requireUser()`/`requireMentor()` por su cuenta —
 * ambas están envueltas en `cache()` (`lib/auth.ts`), así que reinvocarlas aquí no repite
 * trabajo, solo reusa lo que la página que lo monta ya resolvió en esta misma request.
 */
export async function TradeModalGate({
  searchParams,
  viewer,
}: {
  searchParams: { trade?: string; nuevo?: string; fecha?: string }
  viewer: TradeModalViewer
}) {
  if (searchParams.trade && isValidUuid(searchParams.trade)) {
    const db = getDb()
    const tradeId = searchParams.trade
    const detail =
      viewer.mode === 'owner'
        ? await getTradeDetail(db, (await requireUser()).id, tradeId)
        : await getTradeDetailForStudent(db, (await requireMentor()).id, viewer.studentId, tradeId)
    if (!detail) return null

    const t = detail.trade
    const j = detail.journal
    // `journal` puede llegar `null` sólo en teoría (`insertTradeWithJournal` siempre crea
    // una fila, aunque sea vacía) — se cubre igual con `EMPTY_JOURNAL` por robustez, sin
    // asumir ese invariante desde esta capa.
    //
    // `j.emotions` sale tipado por Drizzle como `{antes: string[]; ...}` (columna jsonb
    // ancha, `lib/db/schema.ts`) mientras que `JournalFormState['emotions']` exige el
    // vocabulario cerrado de `EMOTIONS`; el cast es seguro porque la única vía de
    // escritura de esta columna es `journalSchema` (Task 8/14, `saveJournal`/`createTrade`),
    // que ya restringe cada arreglo a ese enum antes de persistir.
    const journal: JournalFormState = j
      ? {
          whyTook: j.whyTook,
          whatSaw: j.whatSaw,
          followedPlan: j.followedPlan,
          didWell: j.didWell,
          didWrong: j.didWrong,
          improve: j.improve,
          emotions: j.emotions as JournalFormState['emotions'],
        }
      : EMPTY_JOURNAL
    // Mismo razonamiento para `phase`: Drizzle ya lo tipa como `'before'|'after'` vía
    // `capturePhaseEnum` (columna no-nullable), el cast solo re-liga el tipo al alias
    // `CapturePhase` de este módulo.
    const captures: ExistingCapture[] = detail.captures.map((c) => ({ id: c.id, phase: c.phase as CapturePhase }))

    // Serializado a ISO string (no el `Date` de Drizzle) para mantener `EditableTrade`
    // consistente con el resto de sus campos ("ya convertidas a un objeto plano y
    // serializable", ver doc de la interfaz) — `JournalSection` lo compara contra un
    // `savedAt` en milisegundos (`Date.now()`) al decidir si ofrecer restaurar un stash local.
    const journalUpdatedAt = j ? j.updatedAt.toISOString() : null

    const plain: EditableTrade = {
      id: t.id,
      tradeDate: t.tradeDate,
      asset: t.asset,
      market: t.market,
      direction: t.direction,
      entryTime: t.entryTime ? t.entryTime.slice(0, 5) : null,
      exitTime: t.exitTime ? t.exitTime.slice(0, 5) : null,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      contracts: t.contracts,
      positionSize: t.positionSize,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      riskUsd: t.riskUsd,
      riskPct: t.riskPct,
      pnlUsd: t.pnlUsd,
      rMultiple: t.rMultiple,
      setup: t.setup,
      timeframe: t.timeframe,
      marketConditions: t.marketConditions,
      entryType: t.entryType,
      confirmations: t.confirmations,
      journal,
      journalUpdatedAt,
      captures,
    }

    // `key` fuerza a React a desmontar/remontar el modal (y por tanto resetear todo su
    // estado interno — form, paso/pestaña activa, errores) en una transición
    // `?trade=A` -> `?trade=B` en el historial; sin esto, React reconciliaría el mismo
    // `TradeModal` y dejaría el form de A pegado al abrir B. `readOnly` solo en modo mentor.
    // `studentId` (Task 16, `FeedbackSection`) solo se pasa en modo mentor — en modo owner
    // queda `undefined`, ver doc de `TradeModalProps.studentId`.
    return (
      <TradeModal
        key={plain.id}
        mode="edit"
        detail={plain}
        readOnly={viewer.mode === 'mentor'}
        studentId={viewer.mode === 'mentor' ? viewer.studentId : undefined}
      />
    )
  }

  // Un mentor nunca crea operaciones a nombre de su alumno: `?nuevo` se ignora por completo
  // en modo mentor, aunque llegue en la URL (defensa en profundidad, no solo ausencia de un
  // botón en la UI — ver `DashboardView`/`CalendarView`, que ya no renderizan ese enlace). Este
  // branch solo se alcanza con `viewer.mode === 'owner'`, así que `readOnly` siempre es `false`
  // aquí — pero `TradeModal` lo exige explícito (prop obligatoria), no opcional.
  if (viewer.mode === 'owner' && searchParams.nuevo) {
    const fecha = searchParams.fecha && FECHA_RE.test(searchParams.fecha) ? searchParams.fecha : todayAppISO()
    return <TradeModal key="create" mode="create" defaultDate={fecha} readOnly={false} />
  }

  return null
}
