'use client'

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, useTransition } from 'react'
import { saveJournal } from '@/lib/actions/trades'
import { uploadCapture, deleteCapture } from '@/lib/actions/captures'
import { journalSchema, type JournalFormValues } from '@/lib/validation/trade'
import { shouldClearStash, ownsStash } from '@/lib/journal-stash'
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

/** Exportado para que el render de solo lectura de la Bitácora (`TradeModal`, modo mentor, Task 12) reuse las mismas preguntas/etiquetas sin duplicarlas. */
export const QUESTIONS: { name: JournalFieldName; label: string }[] = [
  { name: 'whyTook', label: '¿Por qué tomaste la operación?' },
  { name: 'whatSaw', label: '¿Qué viste en el mercado?' },
  { name: 'followedPlan', label: '¿Seguiste tu plan?' },
  { name: 'didWell', label: '¿Qué hiciste bien?' },
  { name: 'didWrong', label: '¿Qué hiciste mal?' },
  { name: 'improve', label: '¿Qué puedes mejorar?' },
]

/** Exportado para que el render de solo lectura de capturas (`TradeModal`, modo mentor, Task 12) reuse las mismas fases/etiquetas sin duplicarlas. */
export const CAPTURE_DEFS: { phase: CapturePhase; label: string }[] = [
  { phase: 'before', label: 'Antes de la operación' },
  { phase: 'after', label: 'Después de la operación' },
]

const DEBOUNCE_MS = 800
const ERROR_GENERICO = 'No se pudo guardar. Intenta de nuevo.'

type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

/** Captura tal como la necesita `CaptureSlot`: id + `v` de cache-busting (ver doc de `CaptureSlotProps.existing`). */
type CaptureSlotValue = { id: string; v: number }

type FlushResult = { ok: boolean; error?: string }

/** Forma persistida en `localStorage` por `stashAndDiscard` — ver doc ahí y en `TradeModal`.
 * `baseUpdatedAt` es el `journalUpdatedAt` (reloj del SERVIDOR, no del cliente) observado en
 * el momento de stashear — ver el efecto de montaje más abajo (Importante #3 del review de
 * Task 5) sobre por qué la decisión de ofrecer restaurar compara esto contra el
 * `journalUpdatedAt` actual en vez de comparar `savedAt` (reloj del cliente) contra él. */
type JournalStash = { savedAt: number; baseUpdatedAt: string | null; state: JournalFormState }

/** Clave de `localStorage` del stash de recuperación de un trade concreto. Versionada
 * (`v2`): la forma de `JournalStash` cambió (se agregó `baseUpdatedAt`, Importante #3) y no
 * hay necesidad de migrar/interpretar restos con la forma vieja — un stash `v1` huérfano
 * simplemente deja de leerse (nunca se borra activamente, pero tampoco se usa ni causa daño). */
function stashKey(tradeId: string): string {
  return `smartmoney.journal-stash.v2.${tradeId}`
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
   * `TradeModalGate` — se compara (igualdad exacta, no aritmética entre relojes distintos,
   * ver Importante #3 del review) contra el `baseUpdatedAt` de un stash local
   * (`stashAndDiscard`) al montar para decidir si ofrecer restaurarlo (ver el efecto más
   * abajo). `undefined`/`null` en modo crear o si el journal del servidor no existiera (en
   * la práctica siempre existe, ver `insertTradeWithJournal`). */
  journalUpdatedAt?: string | null
  /** Se invoca (a lo sumo una vez, al montar) si se detecta un stash de recuperación válido
   * y aplicable — `TradeModal` lo usa para saltar a la pestaña Bitácora (`setTab(1)`) en modo
   * editar, porque `JournalSection` se monta oculta (`display:none`) cuando esa pestaña no
   * está activa y la barra "Restaurar/Descartar" quedaría invisible si no (Importante #2 del
   * review — el mismo problema que ya resolvía `captureWarning` computando `tab` antes del
   * primer render, pero esta detección solo puede saberse tras un efecto de montaje leyendo
   * `localStorage`, así que hay un parpadeo de un frame Datos->Bitácora en vez de cero). */
  onStashDetected?: () => void
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
    onStashDetected,
  }: JournalSectionProps,
  ref,
) {
  const isEdit = tradeId !== undefined

  const [state, setState] = useState<JournalFormState>(initial)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  // Stash de una sesión anterior detectado al montar (ver el efecto más abajo) — `null` si no
  // hay ninguno, si tenía forma inválida (se borró, Importante #4 del review), o si el
  // servidor avanzó desde que se guardó (`baseUpdatedAt` ya no coincide con `journalUpdatedAt`
  // actual, Importante #3 — ese caso NO se borra, solo no se ofrece). Mientras no sea `null`,
  // la barra "Restaurar/Descartar" es visible.
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
        // Crítico 1 del review: SOLO se limpia el stash local si este guardado exitoso
        // corresponde al contenido MÁS RECIENTE (`isStillCurrentContent`, ya calculado
        // arriba) — no basta con que haya tenido éxito. Si el intento en vuelo guardaba una
        // foto vieja ("A") y mientras esperaba respuesta el usuario ya escribió más ("AB") y
        // usó "Descartar cambios y cerrar" (que stashea "AB"), esta respuesta exitosa de "A"
        // NO puede borrar ese stash: el servidor solo tiene "A", así que borrarlo aquí
        // perdería el delta "AB" sin ninguna copia en ningún lado. `shouldClearStash` fija
        // esta tabla de decisión como función pura (ver `lib/journal-stash.ts` y su test).
        // También oculta la barra "Restaurar/Descartar" si estuviera visible (`restoreStash`,
        // estado en memoria e independiente de la clave en `localStorage`): sin esto, un
        // guardado exitoso de una edición cualquiera (sin que el usuario tocara esa barra)
        // la dejaría mostrando un "Restaurar" que sobrescribiría este contenido recién
        // confirmado con el stash viejo.
        if (shouldClearStash({ ok: result.ok, isStillCurrentContent })) {
          clearStash()
          setRestoreStash(null)
        }
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

  /**
   * Borra el stash de recuperación de este trade — SOLO si esta sesión es su dueña
   * legítima (ver `ownsStash`, `lib/journal-stash.ts`): lee lo que hay ACTUALMENTE en la
   * clave y compara su `baseUpdatedAt` contra el `journalUpdatedAt` con el que esta sesión
   * montó. Un stash HUÉRFANO — el que deja la carrera del hallazgo Crítico 1, con un
   * `baseUpdatedAt` que ya no coincide con el `journalUpdatedAt` actual — NO se toca aquí:
   * sin este chequeo, un guardado exitoso ORDINARIO cualquiera de esta sesión reabierta
   * (`shouldClearStash` -> `clearStash()`) borraría de rebote un huérfano que esta sesión
   * nunca escribió ni confirmó (hallazgo Importante de la ronda 2 del review).
   *
   * Excepción documentada: un stash corrupto o con forma inválida NO pasa por esta función
   * — se borra sin condiciones desde el efecto de montaje (`removeStashUnconditionally`),
   * porque es basura irrecuperable sin importar de quién sea.
   *
   * Nunca lanza: cualquier fallo al leer/parsear lo que hay actualmente en la clave se trata
   * como "no se puede confirmar dueño" y por lo tanto NO borra — más seguro asumir que NO es
   * suyo que arriesgarse a destruir un huérfano ajeno por un error de lectura transitorio.
   * Ignora también fallos de escritura de `localStorage` (modo privado, cuota, etc.): nunca
   * debe interrumpir el flujo normal de guardado/cierre.
   */
  function clearStash() {
    if (!isEdit) return
    const key = stashKey(tradeId as string)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const existing = JSON.parse(raw) as Partial<JournalStash>
      const stashBaseUpdatedAt = typeof existing.baseUpdatedAt === 'string' ? existing.baseUpdatedAt : null
      if (!ownsStash({ stashBaseUpdatedAt, sessionBaseUpdatedAt: journalUpdatedAt ?? null })) return
      localStorage.removeItem(key)
    } catch {
      // ver doc de arriba
    }
  }

  /** Borra el stash de recuperación de este trade SIN comprobar dueño — reservado para el
   * efecto de montaje, que ya tiene en mano un candidato corrupto o con forma inválida
   * (JSON roto, envoltura sin `savedAt` numérico, o `state` que no pasa `journalSchema`):
   * ese contenido es basura irrecuperable sin importar de qué sesión venga, así que la
   * comprobación de dueño de `clearStash` no aplica (y de hecho la haría fallar sin sentido,
   * ya que ni siquiera se puede leer un `baseUpdatedAt` confiable de algo corrupto). */
  function removeStashUnconditionally(key: string) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ver doc de `clearStash`
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
      // Minor 5 (bundle autorizado por el controller): sin nada sin guardar, no hay nada
      // que valga la pena stashear — escribir uno igual solo crearía una barra "Restaurar"
      // fantasma la próxima vez que se abra este trade (ofreciendo "recuperar" contenido
      // que en realidad ya coincide con lo que el servidor tiene). Limpia cualquier stash
      // viejo que pudiera quedar de una sesión anterior y no escribe uno nuevo — el cierre
      // sigue su curso igual: `TradeModal.handleDiscardAndClose` llama a `close()` después
      // de esto sin importar qué rama se tomó aquí.
      if (!dirtyRef.current) {
        clearStash()
        return
      }
      try {
        const stash: JournalStash = { savedAt: Date.now(), baseUpdatedAt: journalUpdatedAt ?? null, state: latestRef.current }
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
  // sesión anterior (`stashAndDiscard`) todavía aplicable. `localStorage` solo se toca aquí
  // dentro de un efecto — nunca durante el render (SSR-safe).
  //
  // Importante #4 del review: un stash con forma inválida (JSON corrupto, envoltura sin
  // `savedAt` numérico, o `state` que no pasa `journalSchema`) no es recuperable de forma
  // segura — se trata como si no existiera Y se borra sin condiciones
  // (`removeStashUnconditionally`, no `clearStash()`: es basura irrecuperable sin importar
  // de qué sesión venga, así que la comprobación de dueño no aplica), a diferencia del caso
  // "servidor avanzó" de abajo, que NO se borra.
  //
  // Importante #3 del review: la decisión de ofrecer restaurar ya NO compara `savedAt`
  // (reloj del CLIENTE, en `stashAndDiscard`) contra `journalUpdatedAt` (reloj del
  // SERVIDOR) — un cliente con el reloj atrasado podía hacer que esa comparación numérica
  // cruzada cayera en la rama "obsoleto" y borrara un stash en realidad más nuevo. En vez de
  // eso, el stash guarda `baseUpdatedAt`: el `journalUpdatedAt` que el servidor tenía en el
  // momento de stashear. Aquí se compara ese `baseUpdatedAt` contra el `journalUpdatedAt`
  // ACTUAL por igualdad exacta (mismo reloj, el del servidor, en ambos lados — sin
  // aritmética entre relojes distintos): si coinciden, nadie más guardó nada desde entonces
  // y el stash es seguro de ofrecer. Si difieren, el servidor avanzó por otra vía (p. ej.
  // otra pestaña/sesión) — el stash NO se borra aquí (podría ser un conflicto real que el
  // usuario deba revisar, no un descarte silencioso); la única limpieza en ese caso es un
  // flush exitoso sobre el contenido actual (`shouldClearStash` en `flushSave`).
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

    let candidate: unknown
    try {
      candidate = JSON.parse(raw)
    } catch {
      removeStashUnconditionally(key)
      return
    }

    const wrapper = candidate as Partial<Record<keyof JournalStash, unknown>> | null
    if (typeof wrapper !== 'object' || wrapper === null || typeof wrapper.savedAt !== 'number') {
      removeStashUnconditionally(key)
      return
    }
    const parsedState = journalSchema.safeParse(wrapper.state)
    if (!parsedState.success) {
      removeStashUnconditionally(key)
      return
    }
    const baseUpdatedAt = typeof wrapper.baseUpdatedAt === 'string' ? wrapper.baseUpdatedAt : null

    if (baseUpdatedAt !== (journalUpdatedAt ?? null)) return

    const stash: JournalStash = { savedAt: wrapper.savedAt, baseUpdatedAt, state: parsedState.data }
    // Sincroniza `state` de React con un sistema externo (`localStorage`) leído una sola
    // vez al montar — no hay forma SSR-safe de mover esto al inicializador de `useState`
    // (ese código también correría en el render del servidor, donde `localStorage` no
    // existe), así que un efecto de montaje es la vía correcta aquí, no un smell a evitar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestoreStash(stash)
    // Importante #2 del review: `JournalSection` se monta con `display:none` cuando su
    // pestaña/paso no está activo — sin este aviso, la barra "Restaurar/Descartar" quedaría
    // invisible en un subárbol oculto. `TradeModal` lo usa para saltar a la pestaña Bitácora.
    onStashDetected?.()
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
        <h3 className="uppercase text-neutral-500" style={{ margin: 0, fontSize: '11px', letterSpacing: '0.13em' }}>
          Bitácora de la operación
        </h3>
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
          role="status"
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
