'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { createTrade, removeTrade, updateTrade } from '@/lib/actions/trades'
import { uploadCapture } from '@/lib/actions/captures'
import { formatLongDate } from '@/lib/format'
import { FeedbackSection } from './FeedbackSection'
import { EMOTIONS, PHASES } from '@/lib/emotions'
import {
  DATOS_FIELDS,
  EDIT_TABS,
  ESTRATEGIA_FIELDS,
  RIESGO_FIELDS,
  STEP_SCHEMAS,
  WIZARD_STEPS,
  marketLabel,
  stepForField,
} from './steps'
import { DirectionToggle, FieldGrid, FormField, SectionTitle, type FormState, type TradeFieldName } from './fields'
import { PHASE_LABELS } from './EmotionPicker'
import {
  CAPTURE_DEFS,
  EMPTY_JOURNAL,
  JournalSection,
  QUESTIONS,
  type CapturePhase,
  type ExistingCapture,
  type JournalFormState,
  type JournalSectionHandle,
} from './JournalSection'

const CAPTURE_WARNING_MSG = 'La operación se guardó, pero una captura falló. Puedes reintentarla al editar.'
const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'
const ERROR_GUARDANDO_BITACORA = 'No se pudo guardar la bitácora. Intenta de nuevo antes de cerrar.'

/** Trade + relaciones ya convertidas a un objeto plano y serializable para pasar del Gate (server) a este client component. */
export interface EditableTrade {
  id: string
  tradeDate: string
  asset: string
  market: string
  direction: string
  entryTime: string | null
  exitTime: string | null
  entryPrice: number | null
  exitPrice: number | null
  contracts: number | null
  positionSize: number | null
  stopLoss: number | null
  takeProfit: number | null
  riskUsd: number | null
  riskPct: number | null
  pnlUsd: number
  rMultiple: number | null
  setup: string
  timeframe: string
  marketConditions: string | null
  entryType: string | null
  confirmations: string | null
  journal: JournalFormState
  /** `updatedAt` del journal (ISO string) tal como lo guardó `TradeModalGate` — pasa a
   * `JournalSection` para que compare contra un stash local (`stashAndDiscard`, ver el paso 3
   * del brief de Task 5) y decida si ofrecer restaurarlo. `null` si el journal no existiera
   * (en la práctica siempre existe, ver `insertTradeWithJournal`). */
  journalUpdatedAt: string | null
  captures: ExistingCapture[]
}

const EMPTY_FORM: FormState = {
  tradeDate: '',
  asset: '',
  market: 'indices',
  direction: 'long',
  entryTime: '',
  exitTime: '',
  entryPrice: '',
  exitPrice: '',
  contracts: '',
  positionSize: '',
  stopLoss: '',
  takeProfit: '',
  riskUsd: '',
  riskPct: '',
  pnlUsd: '',
  rMultiple: '',
  setup: '',
  timeframe: '',
  marketConditions: '',
  entryType: '',
  confirmations: '',
}

function numToStr(v: number | null): string {
  return v === null ? '' : String(v)
}

function nullToStr(v: string | null): string {
  return v ?? ''
}

function tradeToForm(t: EditableTrade): FormState {
  return {
    tradeDate: t.tradeDate,
    asset: t.asset,
    market: t.market,
    direction: t.direction,
    entryTime: nullToStr(t.entryTime),
    exitTime: nullToStr(t.exitTime),
    entryPrice: numToStr(t.entryPrice),
    exitPrice: numToStr(t.exitPrice),
    contracts: numToStr(t.contracts),
    positionSize: numToStr(t.positionSize),
    stopLoss: numToStr(t.stopLoss),
    takeProfit: numToStr(t.takeProfit),
    riskUsd: numToStr(t.riskUsd),
    riskPct: numToStr(t.riskPct),
    pnlUsd: String(t.pnlUsd),
    rMultiple: numToStr(t.rMultiple),
    setup: t.setup,
    timeframe: t.timeframe,
    marketConditions: nullToStr(t.marketConditions),
    entryType: nullToStr(t.entryType),
    confirmations: nullToStr(t.confirmations),
  }
}

type TradeModalProps = ({ mode: 'create'; defaultDate: string } | { mode: 'edit'; detail: EditableTrade }) & {
  /** Modo mentor (Task 12): deshabilita todos los inputs (`<fieldset disabled>`), oculta
   * Guardar/Eliminar/Continuar (el footer solo muestra Cerrar) y la Bitácora se renderiza
   * como texto en vez del formulario editable (ver `ReadOnlyJournal`). En la práctica solo
   * llega en `true` junto con `mode: 'edit'` — `TradeModalGate` nunca abre `mode: 'create'`
   * para un mentor (`?nuevo` se ignora ahí), pero SIEMPRE pasa `readOnly` explícitamente en
   * ambos call sites (obligatorio, no opcional) para que un caller nuevo no pueda olvidarlo
   * y dejar un modal editable abierto por accidente en un contexto de solo lectura. */
  readOnly: boolean
  /** Id del estudiante dueño del trade — solo tiene sentido (y solo llega) junto con
   * `readOnly: true` (modo mentor, Task 12): `ReadOnlyJournal` lo necesita para montar
   * `FeedbackSection` (Task 16) con el destinatario correcto de `sendFeedback`.
   * `undefined` en modo owner — el propio alumno viendo su trade nunca ve esa sección. */
  studentId?: string
}

/**
 * Modal de operación. Crear = wizard de 4 pasos (Datos/Riesgo y resultado/Estrategia/
 * Bitácora); editar = 2 pestañas (Datos [= Datos+Riesgo+Estrategia apiladas] / Bitácora).
 * Ver mockup 408-546.
 *
 * La sección Bitácora (`JournalSection`) se monta siempre (no solo cuando su paso/pestaña
 * está activo) y se oculta con `display:none` vía su prop `hidden` — a diferencia de
 * Datos/Riesgo/Estrategia (ligadas al único `form` de arriba, sin estado propio), en modo
 * editar `JournalSection` mantiene su propio debounce de autoguardado; desmontarla al
 * cambiar de pestaña perdería cualquier tecleo de los últimos <800ms que aún no se hubiera
 * guardado.
 */
export function TradeModal(props: TradeModalProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const detail = props.mode === 'edit' ? props.detail : undefined
  const isCreate = props.mode === 'create'
  // Solo verdadero junto a `detail` en la práctica (ver doc de `TradeModalProps.readOnly`) —
  // `showReadOnlyJournal` más abajo revalida `detail !== undefined` de todos modos, sin
  // asumir esa invariante desde aquí.
  const { readOnly, studentId } = props

  // Solo tiene sentido en modo editar: llega tras un `createTrade` exitoso cuyas capturas
  // fallaron al subir (ver `handleFinalSubmit`), que redirige aquí mismo con este query
  // param en vez de perder el aviso en un modal que ya se cerró. Se computa antes de `tab`
  // (abajo) para que ese modal abra directamente en la pestaña Bitácora — si no, el aviso
  // quedaría oculto tras `JournalSection.hidden` hasta que el usuario cambiara de pestaña.
  const captureWarning = detail !== undefined && searchParams.get('captureWarning') === '1'

  const [form, setForm] = useState<FormState>(() =>
    props.mode === 'create' ? { ...EMPTY_FORM, tradeDate: props.defaultDate } : tradeToForm(props.detail),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [tab, setTab] = useState(() => (captureWarning ? 1 : 0))
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Estado de la Bitácora en modo crear únicamente — en modo editar `JournalSection` es
  // autocontenido (autoguarda por su cuenta, ver su doc). `journalRef` deja que
  // `handleFinalSubmit`/`requestClose` fuercen (y esperen) el flush de un guardado
  // pendiente/fallido en modo editar, abortando el cierre si ese flush falla.
  const [journal, setJournal] = useState<JournalFormState>(EMPTY_JOURNAL)
  const [pendingCaptures, setPendingCaptures] = useState<Partial<Record<CapturePhase, File>>>({})
  const [uploadingCaptures, setUploadingCaptures] = useState(false)
  const journalRef = useRef<JournalSectionHandle>(null)

  // Fallos CONSECUTIVOS de flush del autoguardado de la Bitácora, reportados por
  // `JournalSection` vía `onFlushFailure` (0 tras cualquier éxito). A partir de 2, se ofrece
  // "Descartar cambios y cerrar" (ver `handleDiscardAndClose`) junto al `formError` — la
  // única vía deliberada de cerrar con texto sin guardar (excepción documentada al invariante
  // de close-abort de Task 14, ver doc de `requestClose`).
  const [flushFailures, setFlushFailures] = useState(0)

  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // true en cuanto el usuario escribe algo directamente en R múltiple; se resetea si lo
  // vuelve a dejar vacío. Mientras sea false, el autocálculo de `updateField` puede seguir
  // recalculando la sugerencia en cada tecleo de riesgo $/P&L (ver finding 1 del review).
  const rTouchedRef = useRef(false)

  // Guardas contra doble click físico en "Eliminar" (finding 2 del review): el segundo click
  // de un dblclick puede caer ya con `confirmDelete=true` y disparar el borrado sin que el
  // usuario realmente haya decidido confirmar. `armedAtRef` ignora clicks demasiado cercanos
  // al armado; `disarmTimerRef` desarma automáticamente pasados unos segundos si no se confirma.
  const armedAtRef = useRef(0)
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const DELETE_IGNORE_MS = 400
  const DELETE_AUTO_DISARM_MS = 4000

  function disarmDelete() {
    setConfirmDelete(false)
    if (disarmTimerRef.current) {
      clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    }
  }, [])

  // Bloquea el scroll del body mientras el modal está abierto (se restaura al desmontar).
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Foco inicial en el primer campo del modal.
  useEffect(() => {
    contentRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [])

  // Escape cierra el modal. `close` se lee vía ref para no reenganchar el listener en cada
  // render. El mismo listener también implementa el focus trap del diálogo: Tab/Shift+Tab en
  // los bordes de la lista de focusables cicla al otro extremo en vez de escapar hacia la
  // página de debajo (que sigue en el DOM detrás del backdrop). La lista de focusables se
  // recalcula en cada Tab (no se cachea): es barata (un `querySelectorAll` acotado al
  // diálogo) y así queda correcta sin importar qué paso/pestaña esté activo en ese momento
  // — cambiar de paso monta/desmonta secciones enteras, así que una lista cacheada al montar
  // quedaría obsoleta en cuanto el usuario avanzara el wizard o cambiara de pestaña.
  const closeRef = useRef<() => void>(() => {})
  useEffect(() => {
    function getFocusables(dialog: HTMLElement): HTMLElement[] {
      const candidates = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      // `offsetParent === null` descarta lo oculto por `display:none` (p. ej. los pasos del
      // wizard no activos, o `JournalSection` cuando su pestaña no está activa) — un
      // elemento así no es alcanzable con Tab en un navegador real, así que tampoco debe
      // contar para el ciclo. También descarta lo deshabilitado, que no puede recibir foco.
      return Array.from(candidates).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = getFocusables(dialog)
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const activeIndex = active instanceof HTMLElement ? focusables.indexOf(active) : -1

      if (e.shiftKey) {
        // En el primero (o con el foco fuera del diálogo, `activeIndex === -1`): envuelve al
        // último en vez de dejar que Shift+Tab se escape hacia atrás de la página.
        if (activeIndex <= 0) {
          e.preventDefault()
          last.focus()
        }
      } else if (activeIndex === -1 || activeIndex === focusables.length - 1) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Cierre incondicional (navega ya mismo) — solo debe llamarse una vez que cualquier
   * guardado pendiente (trade y/o Bitácora) ya se resolvió con éxito. Ver `requestClose`
   * para las vías de cierre iniciadas por el usuario (Cancelar/Escape/backdrop), que sí
   * deben esperar y poder abortar. */
  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('trade')
    params.delete('nuevo')
    params.delete('fecha')
    params.delete('captureWarning')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  /**
   * Cierre iniciado por el usuario (Cancelar, Escape, click en el backdrop): antes de
   * cerrar de verdad, le da a la Bitácora la oportunidad de guardar cualquier cambio sin
   * confirmar (`flush()` — no-op si no hay nada pendiente, ver `JournalSectionHandle`). Si
   * ese guardado falla, el cierre se ABORTA y el error queda visible (`formError`, siempre
   * renderizado sin importar la pestaña/paso activo) en vez de perder el texto en silencio
   * (hallazgo Crítico del review: antes, `close()` disparaba el flush en fire-and-forget y
   * navegaba de inmediato sin esperar su resultado).
   */
  async function requestClose() {
    const result = await journalRef.current?.flush()
    if (result && !result.ok) {
      setFormError(result.error ?? ERROR_GUARDANDO_BITACORA)
      if (!isCreate) setTab(1)
      return
    }
    close()
  }
  // Refs no deben escribirse durante el render — se actualiza en un efecto (corre después
  // de cada render) para que el listener de Escape del efecto de arriba siempre invoque la
  // versión más reciente de `requestClose` sin tener que reengancharlo en cada render.
  useEffect(() => {
    closeRef.current = requestClose
  })

  /**
   * Escapatoria deliberada al invariante de `requestClose` de arriba: solo se ofrece
   * (ver el botón en el JSX, condicionado a `flushFailures >= 2`) cuando el autoguardado de
   * la Bitácora lleva 2+ fallos consecutivos — en ese punto, seguir bloqueando el cierre
   * atraparía al usuario con un modal que no puede cerrar mientras el guardado no se
   * recupere. En vez de reintentar, `stashAndDiscard()` deja el texto sin guardar en
   * `localStorage` (recuperable al reabrir este trade, ver `JournalSection`) y cierra sin
   * condiciones — la ÚNICA vía que puede cerrar con texto sin confirmar en pantalla.
   */
  function handleDiscardAndClose() {
    journalRef.current?.stashAndDiscard()
    close()
  }

  /**
   * `JournalSection` se monta con `display:none` cuando su pestaña no está activa — en modo
   * editar, `tab` arranca en 0 (Datos), así que un stash de recuperación detectado al montar
   * (ver `JournalSection`'s mount effect) quedaría en un subárbol oculto y la barra
   * "Restaurar/Descartar" nunca llegaría a verse. Mismo patrón que ya usa `captureWarning`
   * más arriba para saltar a la pestaña Bitácora — la diferencia es que esa detección puede
   * hacerse de forma síncrona en el render (viene de `searchParams`) mientras que esta solo
   * se sabe tras un efecto de montaje que lee `localStorage` (no hay forma SSR-safe de
   * saberlo antes), así que hay un parpadeo de un frame Datos->Bitácora en vez de cero.
   */
  function handleStashDetected() {
    if (!isCreate) setTab(1)
  }

  function updateField(name: TradeFieldName, value: string) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })

    // El usuario está escribiendo directamente en R múltiple: a partir de ahora es "suyo" y
    // el autocálculo de abajo deja de tocarlo — hasta que lo vuelva a dejar vacío.
    if (name === 'rMultiple') {
      rTouchedRef.current = value !== ''
    }

    setForm((prev) => {
      const next = { ...prev, [name]: value }
      // Autocálculo suave: mientras el usuario no haya tocado R múltiple (rTouchedRef), cada
      // cambio en riesgo $ o P&L recalcula la sugerencia R = pnl / riesgo — no solo la primera
      // vez. Antes el gate era "next.rMultiple === ''", que se volvía falso en el primer
      // dígito sugerido y dejaba pegado ese primer valor a medio calcular (ver finding 1).
      if ((name === 'riskUsd' || name === 'pnlUsd') && !rTouchedRef.current) {
        const risk = parseFloat(next.riskUsd)
        const pnl = parseFloat(next.pnlUsd)
        if (Number.isFinite(risk) && risk !== 0 && Number.isFinite(pnl)) {
          next.rMultiple = (pnl / risk).toFixed(2)
        }
      }
      return next
    })
  }

  function handleContinue() {
    setFormError(null)
    const schema = STEP_SCHEMAS[step]
    if (!schema) return
    const result = schema.safeParse(form)
    if (!result.success) {
      setFieldErrors(z.flattenError(result.error).fieldErrors)
      return
    }
    setFieldErrors({})
    setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))
  }

  function applyResultError(result: { ok: false; error: string; fieldErrors?: Record<string, string[]> }) {
    const errs = result.fieldErrors
    if (errs && Object.keys(errs).length > 0) {
      setFieldErrors(errs)
      if (isCreate) {
        setStep(Math.min(...Object.keys(errs).map(stepForField)))
      } else {
        setTab(0)
      }
    } else {
      setFormError(result.error)
    }
  }

  function handleFinalSubmit() {
    setFormError(null)
    startTransition(async () => {
      if (detail) {
        // El botón del footer solo guarda los campos del trade — la Bitácora autoguarda
        // sola con debounce (`JournalSection`); `flush()` cancela un debounce pendiente
        // (si lo hay) y guarda ya mismo (incluso si el intento automático anterior había
        // fallado, ver `JournalSectionHandle.flush`) para que "Guardar cambios" también
        // cubra un tecleo de los últimos <800ms — o un fallo previo sin reintentar.
        // Anotado explícitamente para que el `?? Promise.resolve(...)` de abajo (caso
        // `journalRef.current` nulo, en la práctica inalcanzable ya que la sección se monta
        // siempre) tenga el mismo tipo que `flush()` — si no, `journalResult.error` no
        // tipa contra la rama sin `error` del `??`.
        const journalFlush: Promise<{ ok: boolean; error?: string }> =
          journalRef.current?.flush() ?? Promise.resolve({ ok: true })

        let updateResult: Awaited<ReturnType<typeof updateTrade>>
        let journalResult: Awaited<typeof journalFlush>
        try {
          ;[updateResult, journalResult] = await Promise.all([updateTrade(detail.id, form), journalFlush])
        } catch {
          setFormError(ERROR_INESPERADO)
          return
        }

        if (!updateResult.ok) {
          applyResultError(updateResult)
          return
        }
        if (!journalResult.ok) {
          // El trade sí se guardó, pero la Bitácora no — NO se cierra el modal con texto
          // sin confirmar todavía en pantalla (hallazgo Crítico del review): se muestra el
          // error y se salta a la pestaña Bitácora para que el indicador de estado también
          // sea visible, y el usuario puede reintentar con el mismo botón.
          setFormError(journalResult.error ?? ERROR_GUARDANDO_BITACORA)
          setTab(1)
          return
        }
        close()
        router.refresh()
        return
      }

      // Modo crear: la Bitácora (texto/emociones) se envía junto con el trade;
      // las capturas todavía no tienen a qué `tradeId` pertenecer, así que se suben
      // recién después, con el id que devuelve `createTrade`.
      const result = await createTrade(form, journal)
      if (!result.ok) {
        applyResultError(result)
        return
      }

      const newId = result.data.id
      const filesToUpload = Object.entries(pendingCaptures).filter(
        (entry): entry is [CapturePhase, File] => Boolean(entry[1]),
      )

      if (filesToUpload.length > 0) {
        setUploadingCaptures(true)
        let anyFailed = false
        try {
          // Secuencial (no Promise.all): el brief pide subirlas una a una tras crear el trade.
          for (const [phase, file] of filesToUpload) {
            const formData = new FormData()
            formData.append('file', file)
            try {
              const uploadResult = await uploadCapture(newId, phase, formData)
              if (!uploadResult.ok) anyFailed = true
            } catch {
              // Fallo de red/transporte en ESTA captura puntual: no debe abortar el resto
              // del `for` (las demás fases igual merecen su intento) ni dejar
              // `uploadingCaptures` pegado en `true` (por eso el `finally` de abajo, no
              // este catch interno, es quien lo apaga).
              anyFailed = true
            }
          }
        } finally {
          setUploadingCaptures(false)
        }

        if (anyFailed) {
          // Una captura fallida NO deshace el trade ya creado: en vez de cerrar con el
          // error perdido, se abre el modo editar del trade recién creado (mismo Gate,
          // otra navegación) con un aviso visible en la sección de capturas — ahí el
          // usuario puede reintentar la subida.
          const params = new URLSearchParams(searchParams.toString())
          params.delete('nuevo')
          params.delete('fecha')
          params.set('trade', newId)
          params.set('captureWarning', '1')
          router.replace(`${pathname}?${params.toString()}`)
          router.refresh()
          return
        }
      }

      close()
      router.refresh()
    })
  }

  function handleDeleteClick() {
    if (!detail) return

    if (!confirmDelete) {
      setConfirmDelete(true)
      armedAtRef.current = Date.now()
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = setTimeout(disarmDelete, DELETE_AUTO_DISARM_MS)
      return
    }

    // Ya armado: si este click llega demasiado pronto después de armar (el segundo click de
    // un dblclick físico sobre el mismo botón), se ignora — evita un borrado disparado sin
    // que el usuario haya tenido tiempo real de decidir confirmar (finding 2 del review).
    if (Date.now() - armedAtRef.current < DELETE_IGNORE_MS) return

    if (disarmTimerRef.current) {
      clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = null
    }
    setFormError(null)
    startTransition(async () => {
      const result = await removeTrade(detail.id)
      if (!result.ok) {
        setConfirmDelete(false)
        setFormError(result.error)
        return
      }
      close()
      router.refresh()
    })
  }

  const showDatos = isCreate ? step === 0 : tab === 0
  const showRiesgo = isCreate ? step === 1 : tab === 0
  const showEstrategia = isCreate ? step === 2 : tab === 0
  const showBitacora = isCreate ? step === 3 : tab === 1

  // Fallback si el título computado quedara vacío (p. ej. editando un trade cuyo `asset` el
  // usuario acaba de borrar del todo, antes de volver a escribir algo) — sin esto,
  // `aria-labelledby="trademodal-title"` apuntaría a un nodo sin texto y el diálogo quedaría
  // sin nombre accesible para un lector de pantalla.
  const computedTitle = !detail ? 'Registrar operación' : form.setup ? `${form.asset} · ${form.setup}` : form.asset
  const title = computedTitle || 'Registrar operación'
  const dateLine = !detail
    ? `Nuevo registro · ${formatLongDate(form.tradeDate)}`
    : `${formatLongDate(form.tradeDate)} · ${marketLabel(form.market)}${form.timeframe ? ` · ${form.timeframe}` : ''}`

  // Extraído para no duplicar estas 3 secciones: en modo editar viven dentro de un único
  // `role="tabpanel"` (las 3 comparten la misma condición `tab === 0`, ver `showDatos`/
  // `showRiesgo`/`showEstrategia` arriba); en modo crear, cada una es un paso independiente
  // del wizard y no necesita ese wrapper (ver más abajo, en el JSX).
  //
  // El `<fieldset disabled={readOnly}>` (Task 12, modo mentor) deshabilita TODOS los
  // controles de formulario descendientes (`input`/`select`/los `<button>` del segmentado
  // Long/Short de `DirectionToggle`) de una sola vez — sin `.btn`/`.input:disabled` en
  // `nocturne.css` para ninguno de esos elementos, no hay dimming/gris inesperado: el
  // segmentado sigue mostrando su color activo (viene de `style` inline según `value`, no de
  // `:disabled`) tal cual lo vería el alumno, solo que ya no responde a click. `display:
  // contents` saca la caja del fieldset del flujo (sin afectar el `gap` del contenedor
  // flex/grid que lo envuelve); `disabled={false}` (owner) lo deja completamente inerte.
  const datosRiesgoEstrategiaSections = (
    <fieldset disabled={readOnly} style={{ display: 'contents', border: 0, margin: 0, padding: 0 }}>
      {showDatos && (
        <section className="flex flex-col gap-[12px]">
          <SectionTitle>Información básica</SectionTitle>
          <FieldGrid>
            {DATOS_FIELDS.map((f) => (
              <FormField
                key={f.name}
                field={f}
                value={form[f.name]}
                onChange={(v) => updateField(f.name, v)}
                errors={fieldErrors[f.name]}
              />
            ))}
            <DirectionToggle value={form.direction} onChange={(v) => updateField('direction', v)} />
          </FieldGrid>
        </section>
      )}

      {showRiesgo && (
        <section className="flex flex-col gap-[12px]">
          <SectionTitle>Gestión del riesgo y resultado</SectionTitle>
          <FieldGrid>
            {RIESGO_FIELDS.map((f) => (
              <FormField
                key={f.name}
                field={f}
                value={form[f.name]}
                onChange={(v) => updateField(f.name, v)}
                errors={fieldErrors[f.name]}
              />
            ))}
          </FieldGrid>
        </section>
      )}

      {showEstrategia && (
        <section className="flex flex-col gap-[12px]">
          <SectionTitle>Información estratégica</SectionTitle>
          <FieldGrid>
            {ESTRATEGIA_FIELDS.map((f) => (
              <FormField
                key={f.name}
                field={f}
                value={form[f.name]}
                onChange={(v) => updateField(f.name, v)}
                errors={fieldErrors[f.name]}
              />
            ))}
          </FieldGrid>
        </section>
      )}
    </fieldset>
  )

  // Modo mentor (Task 12): la Bitácora se renderiza como texto de solo lectura
  // (`ReadOnlyJournal`), no `JournalSection` — ese componente autoguarda y sube/borra
  // capturas mediante Server Actions gateadas por dueño (`saveJournal`/`uploadCapture`/
  // `deleteCapture`, todas `requireUser()` contra el trade), que no aplican — ni deberían
  // intentarse — para un mentor viendo el trade de otra persona. `detail !== undefined` es
  // redundante con `readOnly` en la práctica (ver doc de `TradeModalProps.readOnly`), pero se
  // revalida aquí para no asumir esa invariante.
  const journalSectionEl = readOnly && detail ? (
    <ReadOnlyJournal
      journal={detail.journal}
      captures={detail.captures}
      hidden={!showBitacora}
      tradeId={detail.id}
      studentId={studentId}
    />
  ) : (
    <JournalSection
      ref={journalRef}
      hidden={!showBitacora}
      tradeId={detail?.id}
      initial={detail ? detail.journal : journal}
      captures={detail?.captures ?? []}
      onChange={isCreate ? setJournal : undefined}
      pendingCaptures={isCreate ? pendingCaptures : undefined}
      onPendingCapturesChange={isCreate ? setPendingCaptures : undefined}
      notice={captureWarning ? CAPTURE_WARNING_MSG : null}
      onFlushFailure={setFlushFailures}
      journalUpdatedAt={detail?.journalUpdatedAt ?? null}
      onStashDetected={handleStashDetected}
    />
  )

  return (
    <>
      <style>{`
        .trademodal-backdrop {
          position: fixed; inset: 0; z-index: 60;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 44px 20px; overflow: auto;
          background: color-mix(in oklab, var(--scrim-base) 72%, transparent);
          backdrop-filter: blur(3px);
        }
        .trademodal-dialog {
          width: min(940px, 100%); max-height: calc(100vh - 88px);
          background: var(--color-neutral-900); border: 1px solid var(--color-neutral-700);
          border-radius: 14px; box-shadow: var(--shadow-lg);
          display: flex; flex-direction: column; overflow: hidden;
          animation: smRise .22s ease both;
        }
        .trademodal-content { overflow-y: auto; }
        @media (max-width: 639px) {
          .trademodal-backdrop { padding: 0; align-items: stretch; }
          .trademodal-dialog { width: 100%; height: 100%; max-height: 100%; border-radius: 0; border: 0; }
        }
      `}</style>

      <div className="trademodal-backdrop" onClick={() => void requestClose()}>
        <div
          ref={dialogRef}
          className="trademodal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trademodal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-[14px] border-b border-neutral-800 px-[22px] py-[18px]">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span
                id="trademodal-title"
                className="text-[15px]"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
              >
                {title}
              </span>
              <span className="text-[11.5px] text-neutral-500">{dateLine}</span>
            </div>
            <button
              type="button"
              onClick={() => void requestClose()}
              aria-label="Cerrar"
              className="btn btn-ghost btn-icon ml-auto"
              style={{ width: '30px', height: '30px' }}
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 px-[22px] pt-[12px]" role={isCreate ? undefined : 'tablist'}>
            {(isCreate ? WIZARD_STEPS : EDIT_TABS).map((label, i) => {
              const active = isCreate ? step === i : tab === i
              return (
                <button
                  key={label}
                  type="button"
                  role={isCreate ? undefined : 'tab'}
                  aria-selected={isCreate ? undefined : active}
                  aria-controls={isCreate ? undefined : `trademodal-panel-${i}`}
                  id={isCreate ? undefined : `trademodal-tab-${i}`}
                  onClick={() => {
                    disarmDelete()
                    if (isCreate) setStep(i)
                    else setTab(i)
                  }}
                  className="flex items-center gap-[7px] border-0 bg-transparent px-[12px] py-[8px] text-[12px]"
                  style={{
                    borderBottom: `2px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                    color: active ? 'var(--color-text)' : 'var(--color-neutral-500)',
                  }}
                >
                  {isCreate ? (
                    <span
                      className="flex items-center justify-center rounded-full text-[9.5px]"
                      style={{
                        width: '17px',
                        height: '17px',
                        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-700)'}`,
                        color: active ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
                      }}
                    >
                      {i + 1}
                    </span>
                  ) : null}
                  {label}
                </button>
              )
            })}
          </div>

          <div ref={contentRef} className="trademodal-content flex flex-col gap-[20px] px-[22px] py-[18px]">
            {isCreate ? (
              datosRiesgoEstrategiaSections
            ) : (
              <div
                role="tabpanel"
                id="trademodal-panel-0"
                aria-labelledby="trademodal-tab-0"
                hidden={tab !== 0}
                className="flex flex-col gap-[20px]"
              >
                {datosRiesgoEstrategiaSections}
              </div>
            )}

            {isCreate ? (
              journalSectionEl
            ) : (
              <div role="tabpanel" id="trademodal-panel-1" aria-labelledby="trademodal-tab-1" hidden={tab !== 1}>
                {journalSectionEl}
              </div>
            )}

            {(formError || flushFailures >= 2) && (
              <div className="flex flex-wrap items-center gap-[10px]">
                {formError && (
                  <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
                    {formError}
                  </p>
                )}
                {flushFailures >= 2 && (
                  <button
                    type="button"
                    onClick={handleDiscardAndClose}
                    className="btn btn-ghost text-[12px]"
                    style={{ color: 'var(--neg)' }}
                  >
                    Descartar cambios y cerrar
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-[10px] border-t border-neutral-800 px-[22px] py-[14px]">
            {readOnly ? (
              // Modo mentor (Task 12): el footer solo muestra Cerrar — nada que guardar, nada
              // que eliminar (`requestClose` sigue siendo la vía correcta: intenta un flush de
              // la Bitácora antes de navegar, no-op aquí porque `journalRef` nunca se adjunta
              // cuando se renderiza `ReadOnlyJournal` en vez de `JournalSection`).
              <div className="ml-auto flex gap-[8px]">
                <button type="button" onClick={() => void requestClose()} className="btn btn-ghost text-[12px]">
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {detail ? (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isPending}
                    className="btn btn-ghost text-[12px]"
                    style={{ color: 'var(--neg)' }}
                  >
                    {confirmDelete ? '¿Seguro? Eliminar definitivamente' : 'Eliminar'}
                  </button>
                ) : (
                  <span className="text-[11.5px] text-neutral-500">Se guarda al finalizar</span>
                )}

                <div className="ml-auto flex gap-[8px]">
                  <button type="button" onClick={() => void requestClose()} className="btn btn-ghost text-[12px]">
                    Cancelar
                  </button>
                  {isCreate && step < WIZARD_STEPS.length - 1 ? (
                    <button type="button" onClick={handleContinue} className="btn btn-primary text-[12px]" disabled={isPending}>
                      Continuar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFinalSubmit}
                      className="btn btn-primary text-[12px]"
                      disabled={isPending}
                    >
                      {isPending
                        ? uploadingCaptures
                          ? 'Subiendo capturas…'
                          : 'Guardando…'
                        : isCreate
                          ? 'Guardar operación'
                          : 'Guardar cambios'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Bitácora en modo solo lectura (mentor, Task 12) — mismo layout visual que
 * `JournalSection` (mismas preguntas/etiquetas, vía `QUESTIONS`/`CAPTURE_DEFS` exportados
 * de ahí, y las mismas fases/etiquetas de emoción, vía `PHASE_LABELS` exportado de
 * `EmotionPicker`) pero sin ningún control editable: texto en bloques (`<p>`, no
 * `<textarea>`), chips de emoción `aria-disabled` (sin `onClick`, sin autoguardado) y
 * capturas mostradas sin las affordances de subir/eliminar (ni zona de drop, ni botón
 * "Eliminar" — solo la imagen, o "Sin captura" si esa fase no tiene una).
 *
 * No reusa `JournalSection` directamente: ese componente autoguarda (`saveJournal`) y
 * sube/borra capturas (`uploadCapture`/`deleteCapture`) mediante Server Actions gateadas por
 * dueño (`requireUser()` contra el trade) — llamadas que fallarían, o que ni siquiera
 * deberían intentarse, para un mentor viendo el trade de un alumno.
 */
function ReadOnlyJournal({
  journal,
  captures,
  hidden,
  tradeId,
  studentId,
}: {
  journal: JournalFormState
  captures: ExistingCapture[]
  hidden: boolean
  tradeId: string
  /** `undefined` solo en teoría (ver doc de `TradeModalProps.studentId`) — se revalida
   * aquí de todos modos, mismo criterio defensivo que el resto de este componente, en vez
   * de asumir la invariante "readOnly implica studentId definido". */
  studentId: string | undefined
}) {
  // `v` de cache-busting para las imágenes de captura (mismo motivo que `CaptureSlot`, ver su
  // doc): sin él, el cache del navegador/CDN de `get()` podría servir bytes de una re-subida
  // anterior bajo la misma URL. Un único valor por montaje (no uno por captura) alcanza aquí:
  // a diferencia de `CaptureSlot`, esta vista es de solo lectura y nunca sube nada que
  // necesite invalidar el cache a mitad de sesión. Inicializador perezoso de `useState` (no
  // `useMemo`, que `react-hooks/purity` marca como impuro incluso memoizado) — mismo patrón
  // que el `Date.now()` por captura en el inicializador de `captureState` de `JournalSection`.
  const [v] = useState(() => Date.now())

  return (
    <section className="flex flex-col gap-[14px]" style={hidden ? { display: 'none' } : undefined}>
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <h3 className="m-0 text-[11px] tracking-[0.13em] uppercase text-neutral-500">Bitácora de la operación</h3>
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {QUESTIONS.map((q) => (
          <div key={q.name} className="flex flex-col gap-[6px]">
            <span className="text-[11.5px] text-neutral-300">{q.label}</span>
            <p className="input m-0" style={{ minHeight: '90px', whiteSpace: 'pre-wrap' }}>
              {journal[q.name] || '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-[9px]">
        <span className="text-[11.5px] text-neutral-300">Estado emocional</span>
        <div className="flex flex-col gap-[9px]">
          {PHASES.map((phase) => (
            <div key={phase} className="flex flex-wrap items-center gap-[10px]">
              <span className="w-[70px] flex-none text-[11px] text-neutral-500">{PHASE_LABELS[phase]}</span>
              {EMOTIONS.map((emotion) => {
                const active = journal.emotions[phase].includes(emotion)
                return (
                  <span
                    key={emotion}
                    aria-disabled="true"
                    className="rounded-[20px] px-[11px] py-[5px] text-[11.5px]"
                    style={{
                      border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-700)'}`,
                      background: active ? 'var(--color-accent-900)' : 'transparent',
                      color: active ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
                    }}
                  >
                    {emotion}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {CAPTURE_DEFS.map((c) => {
          const existing = captures.find((cap) => cap.phase === c.phase)
          return (
            <div
              key={c.phase}
              className="relative flex h-[150px] flex-col items-center justify-center gap-[6px] overflow-hidden rounded-[10px]"
              style={{ border: '1px dashed var(--color-neutral-700)', background: 'var(--color-neutral-800)' }}
            >
              {existing ? (
                // eslint-disable-next-line @next/next/no-img-element -- captura privada autenticada, no un asset estático de next/image
                <img
                  src={`/api/captures/${existing.id}?v=${v}`}
                  alt={c.label}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[12px] text-neutral-400">{c.label} · sin captura</span>
              )}
            </div>
          )
        })}
      </div>

      {studentId ? <FeedbackSection studentId={studentId} tradeId={tradeId} /> : null}
    </section>
  )
}
