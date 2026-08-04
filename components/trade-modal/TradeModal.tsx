'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { createTrade, removeTrade, updateTrade } from '@/lib/actions/trades'
import { uploadCapture } from '@/lib/actions/captures'
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
import {
  EMPTY_JOURNAL,
  JournalSection,
  type CapturePhase,
  type ExistingCapture,
  type JournalFormState,
  type JournalSectionHandle,
} from './JournalSection'

const CAPTURE_WARNING_MSG = 'La operación se guardó, pero una captura falló. Puedes reintentarla al editar.'

const MONTH_NAMES_LOWER = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** '2026-08-03' -> '3 de agosto, 2026'. Devuelve la entrada tal cual si no tiene forma de fecha. */
function formatLongDate(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} de ${MONTH_NAMES_LOWER[m - 1]}, ${y}`
}

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

type TradeModalProps = { mode: 'create'; defaultDate: string } | { mode: 'edit'; detail: EditableTrade }

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
  // `handleFinalSubmit`/`close` fuercen el flush de un debounce pendiente en modo editar.
  const [journal, setJournal] = useState<JournalFormState>(EMPTY_JOURNAL)
  const [pendingCaptures, setPendingCaptures] = useState<Partial<Record<CapturePhase, File>>>({})
  const [uploadingCaptures, setUploadingCaptures] = useState(false)
  const journalRef = useRef<JournalSectionHandle>(null)

  const contentRef = useRef<HTMLDivElement>(null)

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

  // Escape cierra el modal. `close` se lee vía ref para no reenganchar el listener en cada render.
  const closeRef = useRef<() => void>(() => {})
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function close() {
    // Fire-and-forget: si quedaba un debounce de autoguardado de la Bitácora sin disparar
    // (usuario cierra <800ms después de su último tecleo), lo cancela y guarda ya mismo —
    // no bloquea el cierre del modal por esto (no-op en modo crear, ver `JournalSection`).
    void journalRef.current?.flush()

    const params = new URLSearchParams(searchParams.toString())
    params.delete('trade')
    params.delete('nuevo')
    params.delete('fecha')
    params.delete('captureWarning')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }
  // Refs no deben escribirse durante el render — se actualiza en un efecto (corre después
  // de cada render) para que el listener de Escape del efecto de arriba siempre invoque la
  // versión más reciente de `close` sin tener que reengancharlo en cada render.
  useEffect(() => {
    closeRef.current = close
  })

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
        // (si lo hay, si no es no-op) y guarda ya mismo para que "Guardar cambios" también
        // cubra un tecleo de los últimos <800ms.
        const [result] = await Promise.all([updateTrade(detail.id, form), journalRef.current?.flush() ?? Promise.resolve()])
        if (!result.ok) {
          applyResultError(result)
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
        // Secuencial (no Promise.all): el brief pide subirlas una a una tras crear el trade.
        for (const [phase, file] of filesToUpload) {
          const formData = new FormData()
          formData.append('file', file)
          const uploadResult = await uploadCapture(newId, phase, formData)
          if (!uploadResult.ok) anyFailed = true
        }
        setUploadingCaptures(false)

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

  const title = !detail ? 'Registrar operación' : form.setup ? `${form.asset} · ${form.setup}` : form.asset
  const dateLine = !detail
    ? `Nuevo registro · ${formatLongDate(form.tradeDate)}`
    : `${formatLongDate(form.tradeDate)} · ${marketLabel(form.market)}${form.timeframe ? ` · ${form.timeframe}` : ''}`

  return (
    <>
      <style>{`
        .trademodal-backdrop {
          position: fixed; inset: 0; z-index: 60;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 44px 20px; overflow: auto;
          background: color-mix(in oklab, var(--color-neutral-900) 72%, transparent);
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

      <div className="trademodal-backdrop" onClick={close}>
        <div
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
              onClick={close}
              aria-label="Cerrar"
              className="btn btn-ghost btn-icon ml-auto"
              style={{ width: '30px', height: '30px' }}
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 px-[22px] pt-[12px]">
            {(isCreate ? WIZARD_STEPS : EDIT_TABS).map((label, i) => {
              const active = isCreate ? step === i : tab === i
              return (
                <button
                  key={label}
                  type="button"
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
            />

            {formError && (
              <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
                {formError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-[10px] border-t border-neutral-800 px-[22px] py-[14px]">
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
              <button type="button" onClick={close} className="btn btn-ghost text-[12px]">
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
          </div>
        </div>
      </div>
    </>
  )
}
