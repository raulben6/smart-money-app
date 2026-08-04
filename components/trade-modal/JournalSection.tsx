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

type FlushResult = { ok: boolean; error?: string }

/** Forma persistida en `localStorage` por `stashAndDiscard` — ver doc ahí y en `TradeModal`. */
type JournalStash = { savedAt: number; state: JournalFormState }

/** Clave de `localStorage` del stash de recuperación de un trade concreto. */
function stashKey(tradeId: string): string {
  return `smartmoney.journal-stash.${tradeId}`
}

export interface JournalSectionHandle {
  /**
   * Guarda de inmediato si hay cambios sin confirmar (`dirty`): cancela el debounce
   * pendiente si lo hay y guarda mientras `dirty` sea `true` — **incluso si el último
   * intento automático falló**. Una versión anterior solo actuaba si había un `setTimeout`
   * todavía armado (`debounceRef.current !== null`); tras un fallo ese timer ya se había
   * disparado y limpiado a sí mismo, así que `flush()` se volvía un no-op permanente y el
   * texto sin guardar no tenía ninguna vía de recuperación (hallazgo Crítico del review).
   * No-op (`{ok:true}`) en modo crear o si no hay nada pendiente de guardar. `TradeModal`
   * usa el resultado para decidir si puede cerrar el modal — un fallo aquí debe abortar el
   * cierre (Guardar cambios / Cancelar / Escape / backdrop), no perder el texto en silencio.
   */
  flush: () => Promise<FlushResult>
  /**
   * Escapatoria deliberada al invariante de arriba: guarda el `state` actual (con o sin
   * cambios pendientes) en `localStorage` como stash de recuperación y abandona cualquier
   * debounce en curso, SIN esperar ni reintentar el guardado en el servidor. Pensada para
   * el botón "Descartar cambios y cerrar" que `TradeModal` ofrece tras 2 fallos de flush
   * consecutivos (`onFlushFailure`) — a partir de ahí, seguir bloqueando el cierre del modal
   * (el comportamiento normal de `flush()`) deja al usuario atrapado si el fallo persiste.
   * No-op en modo crear (no hay `tradeId` al que asociar el stash).
   */
  stashAndDiscard: () => void
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
  /** Se invoca con el contador de fallos CONSECUTIVOS de flush cada vez que cambia (0 tras
   * cualquier éxito) — `TradeModal` lo guarda en `flushFailures` para decidir cuándo ofrecer
   * "Descartar cambios y cerrar". No se llama en modo crear (nunca autoguarda, ver `flush`). */
  onFlushFailure?: (count: number) => void
  /** `updatedAt` del journal ya guardado en el servidor (ISO string), serializado por
   * `TradeModalGate` — se compara contra `savedAt` de un stash local (`stashAndDiscard`) al
   * montar para decidir si ofrecer restaurarlo (ver el efecto más abajo). `undefined`/`null`
   * en modo crear o si el journal del servidor no existiera (en la práctica siempre existe,
   * ver `insertTradeWithJournal`). */
  journalUpdatedAt?: string | null
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
 * componente y llamar a `flush()` vía ref antes de cerrar/guardar (ver `JournalSectionHandle`).
 */
export const JournalSection = forwardRef<JournalSectionHandle, JournalSectionProps>(function JournalSection(
  {
    tradeId,
    initial,
    captures,
    onChange,
    pendingCaptures,
    onPendingCapturesChange,
    notice,
    hidden,
    onFlushFailure,
    journalUpdatedAt,
  }: JournalSectionProps,
  ref,
) {
  const isEdit = tradeId !== undefined

  const [state, setState] = useState<JournalFormState>(initial)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  // Stash de una sesión anterior detectado al montar (ver el efecto más abajo) — `null` si no
  // hay ninguno o si el journal ya guardado en el servidor es más nuevo que él (stash obsoleto,
  // ya limpiado en ese caso). Mientras no sea `null`, la barra "Restaurar/Descartar" es visible.
  const [restoreStash, setRestoreStash] = useState<JournalStash | null>(null)

  const [captureState, setCaptureState] = useState<Partial<Record<CapturePhase, CaptureSlotValue>>>(() => {
    const map: Partial<Record<CapturePhase, CaptureSlotValue>> = {}
    for (const c of captures) map[c.phase] = { id: c.id, v: Date.now() }
    return map
  })
  const [captureBusy, setCaptureBusy] = useState<Partial<Record<CapturePhase, boolean>>>({})
  const [captureErrors, setCaptureErrors] = useState<Partial<Record<CapturePhase, string>>>({})
  // Archivo recién soltado/seleccionado en modo editar, mientras su subida está en curso —
  // ver el hallazgo Importante #3 del review: antes de esto, `pendingFile` era estructuralmente
  // inalcanzable en modo editar (`TradeModal` siempre pasaba `undefined`), así que durante una
  // subida la zona seguía mostrando "Arrastra la captura del gráfico" sin ningún feedback.
  // Se limpia en el `finally` de `handleCaptureSelect` (éxito → cambia a `/api/captures` con
  // el `v` nuevo; fallo → revierte a lo que había antes, con el error visible).
  const [uploadingFile, setUploadingFile] = useState<Partial<Record<CapturePhase, File>>>({})

  const [, startTransition] = useTransition()

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Siempre el `state` más reciente — se actualiza de forma síncrona dentro de `updateJournal`
  // (un event handler, no el cuerpo del render), así que a diferencia de una versión anterior
  // no necesita un efecto aparte para mantenerse al día.
  const latestRef = useRef(state)
  // `true` mientras `state` tenga cambios que el servidor todavía no confirmó guardados.
  // Se pone en `true` en cada edición y solo se limpia cuando una respuesta EXITOSA de
  // `saveJournal` corresponde exactamente al contenido más reciente (ver `flushSave`).
  const dirtyRef = useRef(false)
  // Contador monótono de intentos de guardado realmente disparados (debounce que dispara o
  // `flush()` explícito) — permite ignorar la resolución de un intento viejo si uno más nuevo
  // ya empezó, para que una respuesta lenta no pise el estado "Guardando…"/"Guardado ✓"/error
  // de un intento posterior más reciente (hallazgo Importante #2 del review: carrera lenta-A/
  // rápida-AB).
  const attemptSeqRef = useRef(0)

  // Fallos CONSECUTIVOS de flush (se resetea a 0 en cualquier éxito) — solo se toca en la
  // rama `isLatestAttempt` de `flushSave`, igual que `status`/`saveError`, para que una
  // respuesta vieja fuera de orden no lo desincronice. Ver `onFlushFailure`/`stashAndDiscard`.
  const failCountRef = useRef(0)

  async function flushSave(next: JournalFormState): Promise<FlushResult> {
    const mySeq = ++attemptSeqRef.current
    setStatus('pending')
    try {
      const result = await saveJournal(tradeId as string, next)
      // Solo la respuesta del intento MÁS RECIENTE puede actualizar lo que se ve en pantalla
      // — si ya empezó un intento más nuevo (`attemptSeqRef.current !== mySeq`), esta
      // respuesta llegó tarde y se ignora para el status visible (pero su éxito/fallo real
      // SÍ se devuelve al llamador, p. ej. un `flush()` explícito que sí quiere saber si
      // ESTE guardado en particular funcionó).
      const isLatestAttempt = attemptSeqRef.current === mySeq
      // Solo se puede marcar "sin cambios pendientes" si nadie escribió nada nuevo desde que
      // se tomó esta foto de `state` (comparación por referencia: `updateJournal` siempre crea
      // un objeto nuevo, así que `next === latestRef.current` es `false` en cuanto hay una
      // edición posterior, aunque ESTE guardado en particular haya tenido éxito).
      const isStillCurrentContent = next === latestRef.current

      if (result.ok) {
        if (isStillCurrentContent) dirtyRef.current = false
        if (isLatestAttempt) {
          setSaveError(null)
          setStatus('saved')
          failCountRef.current = 0
          onFlushFailure?.(0)
        }
        // Un guardado exitoso deja el stash local (si lo hubiera) obsoleto — se limpia aquí
        // sin importar si este intento en particular era el más reciente: el servidor ya
        // tiene contenido al menos tan nuevo como `next`, así que un stash previo (de un
        // "Descartar cambios y cerrar" anterior) ya no aporta nada que restaurar. También se
        // oculta la barra "Restaurar/Descartar" si estuviera visible (`restoreStash`, estado
        // en memoria e independiente de la clave en `localStorage` que `clearStash` acaba de
        // borrar): sin esto, un guardado exitoso de una edición cualquiera (sin que el
        // usuario llegara a tocar esa barra) la dejaría mostrando un "Restaurar" que
        // sobrescribiría este contenido recién confirmado con el stash viejo.
        clearStash()
        setRestoreStash(null)
        return { ok: true }
      }

      if (isLatestAttempt) {
        setStatus('error')
        setSaveError(result.error)
        failCountRef.current += 1
        onFlushFailure?.(failCountRef.current)
      }
      return { ok: false, error: result.error }
    } catch {
      // Fallo de red/transporte (no un `{ok:false}` normal del Server Action) — se trata
      // igual que un fallo del servidor: no debe dejar `dirty`/status en un estado ambiguo.
      if (attemptSeqRef.current === mySeq) {
        setStatus('error')
        setSaveError(ERROR_GENERICO)
        failCountRef.current += 1
        onFlushFailure?.(failCountRef.current)
      }
      return { ok: false, error: ERROR_GENERICO }
    }
  }

  /** Borra el stash de recuperación de este trade, si lo hay — ignora fallos de `localStorage`
   * (modo privado, cuota, etc.): nunca debe interrumpir el flujo normal de guardado/cierre. */
  function clearStash() {
    if (!isEdit) return
    try {
      localStorage.removeItem(stashKey(tradeId as string))
    } catch {
      // ver doc de arriba
    }
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
      if (!isEdit) return { ok: true }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      // Antes: `if (debounceRef.current === null) return` — un autoguardado que ya había
      // FALLADO deja `debounceRef.current` en `null` (el timer ya disparó y se limpió solo),
      // así que ese guard convertía `flush()` en un no-op permanente justo cuando más se
      // necesitaba reintentar. Ahora se reintenta mientras haya contenido sin confirmar,
      // sin importar si hay un timer armado o no.
      if (!dirtyRef.current) return { ok: true }
      return flushSave(latestRef.current)
    },
    stashAndDiscard() {
      if (!isEdit) return
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      try {
        const stash: JournalStash = { savedAt: Date.now(), state: latestRef.current }
        localStorage.setItem(stashKey(tradeId as string), JSON.stringify(stash))
      } catch {
        // localStorage inaccesible (modo privado, cuota, etc.) — no debe impedir el cierre,
        // que es justamente lo que este botón existe para garantizar aunque el guardado
        // normal esté fallando.
      }
    },
  }))

  function updateJournal(next: JournalFormState) {
    latestRef.current = next
    dirtyRef.current = true
    setState(next)
    if (isEdit) {
      scheduleSave(next)
    } else {
      onChange?.(next)
    }
  }

  // Al montar (una vez por trade abierto — `TradeModalGate` fuerza un remount por `key` en
  // cada `?trade=<id>` distinto, ver su doc), revisa si hay un stash de recuperación de una
  // sesión anterior (`stashAndDiscard`) más nuevo que el journal que el servidor ya tiene
  // (`journalUpdatedAt`, serializado por `TradeModalGate`). Si lo hay, ofrece restaurarlo
  // (`restoreStash` -> barra "Restaurar/Descartar" en el JSX); si no, o si el servidor ya
  // tiene algo más nuevo (p. ej. se guardó desde otra pestaña/sesión), el stash quedó
  // obsoleto y se limpia sin molestar al usuario. `localStorage` solo se toca aquí dentro
  // de un efecto — nunca durante el render (SSR-safe).
  useEffect(() => {
    if (!isEdit) return
    const key = stashKey(tradeId as string)
    let raw: string | null
    try {
      raw = localStorage.getItem(key)
    } catch {
      return
    }
    if (!raw) return

    let parsed: JournalStash
    try {
      parsed = JSON.parse(raw) as JournalStash
    } catch {
      return
    }
    if (typeof parsed.savedAt !== 'number' || typeof parsed.state !== 'object' || parsed.state === null) return

    const serverUpdatedAt = journalUpdatedAt ? new Date(journalUpdatedAt).getTime() : 0
    if (parsed.savedAt > serverUpdatedAt) {
      // Sincroniza `state` de React con un sistema externo (`localStorage`) leído una sola
      // vez al montar — no hay forma SSR-safe de mover esto al inicializador de `useState`
      // (ese código también correría en el render del servidor, donde `localStorage` no
      // existe), así que un efecto de montaje es la vía correcta aquí, no un smell a evitar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRestoreStash(parsed)
    } else {
      try {
        localStorage.removeItem(key)
      } catch {
        // ver doc de `clearStash`
      }
    }
    // Deliberadamente solo al montar: `tradeId`/`journalUpdatedAt` son estables durante toda
    // la vida de esta instancia (el `key` de `TradeModalGate` fuerza un remount por trade).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Botón "Restaurar" de la barra de recuperación: carga el stash en el estado (lo marca
   * `dirty` y dispara el autoguardado normal, igual que cualquier otra edición) y limpia el
   * stash ya consumido. */
  function handleRestoreStash() {
    if (!restoreStash) return
    updateJournal(restoreStash.state)
    setRestoreStash(null)
    clearStash()
  }

  /** Botón "Descartar" de la barra de recuperación: descarta el stash sin tocar el `state`
   * actual (el que ya se cargó desde el servidor al montar). */
  function handleDismissStash() {
    setRestoreStash(null)
    clearStash()
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
    setUploadingFile((prev) => ({ ...prev, [phase]: file }))
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const result = await uploadCapture(tradeId as string, phase, formData)
        if (!result.ok) {
          setCaptureErrors((prev) => ({ ...prev, [phase]: result.error }))
          return
        }
        // `v` se recalcula en cada subida exitosa (no solo al montar) — ver el doc de
        // `CaptureSlotProps.existing` sobre por qué esto es necesario para el cache-busting.
        setCaptureState((prev) => ({ ...prev, [phase]: { id: result.data.captureId, v: Date.now() } }))
      } catch {
        // Fallo de red/transporte: mismo tratamiento que un `{ok:false}` — sin esto, un throw
        // aquí dejaría `captureBusy`/`uploadingFile` pegados en "subiendo" para siempre.
        setCaptureErrors((prev) => ({ ...prev, [phase]: ERROR_GENERICO }))
      } finally {
        setCaptureBusy((prev) => ({ ...prev, [phase]: false }))
        setUploadingFile((prev) => {
          const next = { ...prev }
          delete next[phase]
          return next
        })
      }
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
      try {
        const result = await deleteCapture(existing.id)
        if (!result.ok) {
          setCaptureErrors((prev) => ({ ...prev, [phase]: result.error }))
          return
        }
        setCaptureState((prev) => {
          const next = { ...prev }
          delete next[phase]
          return next
        })
      } catch {
        setCaptureErrors((prev) => ({ ...prev, [phase]: ERROR_GENERICO }))
      } finally {
        setCaptureBusy((prev) => ({ ...prev, [phase]: false }))
      }
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

      {restoreStash && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-[10px] rounded-[9px] px-[12px] py-[9px]"
          style={{ border: '1px solid var(--color-neutral-700)', background: 'var(--color-neutral-800)' }}
        >
          <span className="text-[11.5px] text-neutral-300">Tienes cambios sin guardar de una sesión anterior</span>
          <div className="ml-auto flex gap-[8px]">
            <button type="button" onClick={handleRestoreStash} className="btn btn-ghost text-[12px]">
              Restaurar
            </button>
            <button type="button" onClick={handleDismissStash} className="btn btn-ghost text-[12px]">
              Descartar
            </button>
          </div>
        </div>
      )}

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
            // Modo editar: el preview optimista es el archivo recién soltado mientras sube
            // (`uploadingFile`), no `pendingCaptures` (eso es exclusivo de modo crear — ver
            // el doc de `uploadingFile` arriba, hallazgo Importante #3 del review).
            pendingFile={isEdit ? uploadingFile[c.phase] : pendingCaptures?.[c.phase]}
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
