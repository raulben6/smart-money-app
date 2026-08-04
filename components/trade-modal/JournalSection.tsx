'use client'

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, useTransition } from 'react'
import { saveJournal } from '@/lib/actions/trades'
import { uploadCapture, deleteCapture } from '@/lib/actions/captures'
import type { JournalFormValues } from '@/lib/validation/trade'
import { EmotionPicker, type EmotionsValue } from './EmotionPicker'
import { CaptureSlot } from './CaptureSlot'

/** Estado del journal en el cliente — mismas 7 claves que `journalSchema`, ya en forma de objeto (no strings planos como `FormState` de `fields.tsx`: aquí no hay parseo numérico/fecha de por medio). */
export type JournalFormState = JournalFormValues

export type CapturePhase = 'before' | 'after'

/** Captura existente tal como llega serializada del Gate (server) — solo id + fase. */
export interface ExistingCapture {
  id: string
  phase: CapturePhase
}

export const EMPTY_JOURNAL: JournalFormState = {
  whyTook: '',
  whatSaw: '',
  followedPlan: '',
  didWell: '',
  didWrong: '',
  improve: '',
  emotions: { antes: [], durante: [], despues: [] },
}

type JournalFieldName = Exclude<keyof JournalFormState, 'emotions'>

const QUESTIONS: { name: JournalFieldName; label: string }[] = [
  { name: 'whyTook', label: '¿Por qué tomaste la operación?' },
  { name: 'whatSaw', label: '¿Qué viste en el mercado?' },
  { name: 'followedPlan', label: '¿Seguiste tu plan?' },
  { name: 'didWell', label: '¿Qué hiciste bien?' },
  { name: 'didWrong', label: '¿Qué hiciste mal?' },
  { name: 'improve', label: '¿Qué puedes mejorar?' },
]

const CAPTURE_DEFS: { phase: CapturePhase; label: string }[] = [
  { phase: 'before', label: 'Antes de la operación' },
  { phase: 'after', label: 'Después de la operación' },
]

const DEBOUNCE_MS = 800
const ERROR_GENERICO = 'No se pudo guardar. Intenta de nuevo.'

type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

/** Captura tal como la necesita `CaptureSlot`: id + `v` de cache-busting (ver doc de `CaptureSlotProps.existing`). */
type CaptureSlotValue = { id: string; v: number }

export interface JournalSectionHandle {
  /**
   * Cancela el debounce pendiente (si lo hay) y guarda de inmediato. No-op en modo
   * crear (nunca autoguarda) o si no hay un guardado pendiente en curso. Lo llama
   * `TradeModal` antes de cerrar o al confirmar "Guardar cambios" para que un cambio
   * tecleado en los últimos <800ms no se pierda.
   */
  flush: () => Promise<void>
}

export interface JournalSectionProps {
  /** `undefined` = modo crear (el estado se levanta vía `onChange`, sin autoguardado). */
  tradeId?: string
  initial: JournalFormState
  captures: ExistingCapture[]
  onChange?: (state: JournalFormState) => void
  /** Modo crear: `File`s aún no subidos (se guardan tras `createTrade`, ver `TradeModal`). */
  pendingCaptures?: Partial<Record<CapturePhase, File>>
  onPendingCapturesChange?: (files: Partial<Record<CapturePhase, File>>) => void
  /** Aviso a mostrar bajo las capturas (p. ej. una subida que falló tras crear el trade). */
  notice?: string | null
  /** Oculta la sección con `display:none` en vez de desmontarla — necesario en modo editar
   * para que un debounce pendiente sobreviva un cambio de pestaña (ver `TradeModal`). */
  hidden?: boolean
}

/**
 * Sección "Bitácora de la operación" (mockup 480-521): 6 preguntas de texto libre,
 * estado emocional (antes/durante/después) y 2 capturas (antes/después).
 *
 * Modo crear (`tradeId` undefined): el estado se levanta vía `onChange`/
 * `onPendingCapturesChange` en cada cambio — `TradeModal` lo guarda junto con el trade
 * al finalizar el wizard (`createTrade(raw, journalRaw)` + subida de capturas con el id
 * nuevo). Nunca autoguarda aquí.
 *
 * Modo editar (`tradeId` presente): autoguarda el texto/emociones con debounce de 800ms
 * (`saveJournal`) e indicador "Guardando…"/"Guardado ✓"/error junto al título; las
 * capturas se suben/borran de inmediato al soltar/eliminar (`uploadCapture`/
 * `deleteCapture`), sin esperar al debounce ni al botón "Guardar cambios" del footer —
 * todo autocontenido, `TradeModal` no necesita orquestar nada más que montar este
 * componente y (opcionalmente) llamar a `flush()` vía ref antes de cerrar/guardar.
 */
export const JournalSection = forwardRef<JournalSectionHandle, JournalSectionProps>(function JournalSection(
  { tradeId, initial, captures, onChange, pendingCaptures, onPendingCapturesChange, notice, hidden }: JournalSectionProps,
  ref,
) {
  const isEdit = tradeId !== undefined

  const [state, setState] = useState<JournalFormState>(initial)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const [captureState, setCaptureState] = useState<Partial<Record<CapturePhase, CaptureSlotValue>>>(() => {
    const map: Partial<Record<CapturePhase, CaptureSlotValue>> = {}
    for (const c of captures) map[c.phase] = { id: c.id, v: Date.now() }
    return map
  })
  const [captureBusy, setCaptureBusy] = useState<Partial<Record<CapturePhase, boolean>>>({})
  const [captureErrors, setCaptureErrors] = useState<Partial<Record<CapturePhase, string>>>({})

  const [, startTransition] = useTransition()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef(state)
  // Los refs no deben escribirse durante el render — se actualiza en un efecto (corre
  // después de cada render, sin lista de dependencias) para que `flush()` siempre lea el
  // último `state`, igual que el patrón de `closeRef` en `TradeModal.tsx`.
  useEffect(() => {
    latestRef.current = state
  })

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function flushSave(next: JournalFormState) {
    setStatus('pending')
    // `tradeId` está garantizado por los dos únicos call-sites (scheduleSave, solo
    // alcanzable si `isEdit`; y `flush()` del ref, que chequea `isEdit` primero).
    const result = await saveJournal(tradeId as string, next)
    if (!result.ok) {
      setStatus('error')
      setSaveError(result.error)
      return
    }
    setSaveError(null)
    setStatus('saved')
  }

  function scheduleSave(next: JournalFormState) {
    setStatus('pending')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void flushSave(next)
    }, DEBOUNCE_MS)
  }

  useImperativeHandle(ref, () => ({
    async flush() {
      if (!isEdit || debounceRef.current === null) return
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      await flushSave(latestRef.current)
    },
  }))

  function updateJournal(next: JournalFormState) {
    setState(next)
    if (isEdit) {
      scheduleSave(next)
    } else {
      onChange?.(next)
    }
  }

  function handleFieldChange(name: JournalFieldName, value: string) {
    updateJournal({ ...state, [name]: value })
  }

  function handleEmotionsChange(emotions: EmotionsValue) {
    updateJournal({ ...state, emotions })
  }

  function handleCaptureSelect(phase: CapturePhase, file: File) {
    if (!isEdit) {
      onPendingCapturesChange?.({ ...pendingCaptures, [phase]: file })
      return
    }

    setCaptureErrors((prev) => ({ ...prev, [phase]: undefined }))
    setCaptureBusy((prev) => ({ ...prev, [phase]: true }))
    startTransition(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const result = await uploadCapture(tradeId as string, phase, formData)
      setCaptureBusy((prev) => ({ ...prev, [phase]: false }))
      if (!result.ok) {
        setCaptureErrors((prev) => ({ ...prev, [phase]: result.error }))
        return
      }
      // `v` se recalcula en cada subida exitosa (no solo al montar) — ver el doc de
      // `CaptureSlotProps.existing` sobre por qué esto es necesario para el cache-busting.
      setCaptureState((prev) => ({ ...prev, [phase]: { id: result.data.captureId, v: Date.now() } }))
    })
  }

  function handleCaptureDelete(phase: CapturePhase) {
    if (!isEdit) {
      const next = { ...pendingCaptures }
      delete next[phase]
      onPendingCapturesChange?.(next)
      return
    }

    const existing = captureState[phase]
    if (!existing) return
    setCaptureErrors((prev) => ({ ...prev, [phase]: undefined }))
    setCaptureBusy((prev) => ({ ...prev, [phase]: true }))
    startTransition(async () => {
      const result = await deleteCapture(existing.id)
      setCaptureBusy((prev) => ({ ...prev, [phase]: false }))
      if (!result.ok) {
        setCaptureErrors((prev) => ({ ...prev, [phase]: result.error }))
        return
      }
      setCaptureState((prev) => {
        const next = { ...prev }
        delete next[phase]
        return next
      })
    })
  }

  const statusLabel =
    status === 'pending' ? 'Guardando…' : status === 'saved' ? 'Guardado ✓' : status === 'error' ? (saveError ?? ERROR_GENERICO) : ''

  return (
    <section className="flex flex-col gap-[14px]" style={hidden ? { display: 'none' } : undefined}>
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <h3 className="m-0 text-[11px] tracking-[0.13em] uppercase text-neutral-500">Bitácora de la operación</h3>
        <span className="text-[11px] text-neutral-500">Lo que escribas aquí es lo que tu mentor va a leer</span>
        {isEdit && (
          <span
            aria-live="polite"
            className="ml-auto text-[11px]"
            style={{ color: status === 'error' ? 'var(--neg)' : 'var(--color-neutral-500)' }}
          >
            {statusLabel}
          </span>
        )}
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {QUESTIONS.map((q) => (
          <JournalField key={q.name} name={q.name} label={q.label} value={state[q.name]} onChange={handleFieldChange} />
        ))}
      </div>

      <div className="flex flex-col gap-[9px]">
        <span className="text-[11.5px] text-neutral-300">Estado emocional</span>
        <EmotionPicker value={state.emotions} onChange={handleEmotionsChange} />
      </div>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {CAPTURE_DEFS.map((c) => (
          <CaptureSlot
            key={c.phase}
            phase={c.phase}
            label={c.label}
            existing={captureState[c.phase]}
            pendingFile={pendingCaptures?.[c.phase]}
            busy={captureBusy[c.phase]}
            error={captureErrors[c.phase]}
            onSelect={(file) => handleCaptureSelect(c.phase, file)}
            onDelete={() => handleCaptureDelete(c.phase)}
          />
        ))}
      </div>

      {notice && (
        <p role="alert" className="m-0 text-neg" style={{ fontSize: '12px' }}>
          {notice}
        </p>
      )}
    </section>
  )
})

function JournalField({
  name,
  label,
  value,
  onChange,
}: {
  name: JournalFieldName
  label: string
  value: string
  onChange: (name: JournalFieldName, value: string) => void
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-[6px]">
      <span className="text-[11.5px] text-neutral-300">{label}</span>
      <textarea
        id={id}
        rows={3}
        className="input"
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </label>
  )
}
