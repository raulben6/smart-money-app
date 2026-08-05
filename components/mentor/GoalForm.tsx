'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import type { DbGoal } from '@/lib/db/schema'
import { createGoal, removeGoal, updateGoal } from '@/lib/actions/mentor'
import { goalSchema } from '@/lib/validation/mentor'
import { todayLocalISO } from '@/lib/format'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

const KIND_OPTIONS: { value: DbGoal['kind']; label: string }[] = [
  { value: 'ganancia', label: 'Ganancia ($)' },
  { value: 'operaciones', label: 'Nº de operaciones' },
  { value: 'win_rate', label: 'Win Rate (%)' },
  { value: 'riesgo_diario', label: 'Riesgo diario máx.' },
  { value: 'manual', label: 'Manual' },
]

/** Etiqueta del campo `targetValue` según `kind` — no se llama para 'manual' (ese kind lo oculta, ver JSX). */
function targetValueLabel(kind: DbGoal['kind']): string {
  switch (kind) {
    case 'ganancia':
      return 'Meta de ganancia ($)'
    case 'operaciones':
      return 'Número de operaciones objetivo'
    case 'win_rate':
      return 'Win Rate objetivo (%)'
    case 'riesgo_diario':
      return 'Racha objetivo (días)'
    case 'manual':
      return 'Meta'
  }
}

/** Objetivo tal como llega de la base de datos, ya reducido a los campos que este form edita (sin `userId`/`createdAt`/`updatedAt`). */
export type EditableGoal = {
  id: string
  kind: DbGoal['kind']
  name: string
  description: string
  targetValue: number
  thresholdValue: number | null
  manualProgress: number | null
  startDate: string
  dueDate: string
}

type GoalFieldState = {
  kind: DbGoal['kind']
  name: string
  description: string
  targetValue: string
  thresholdValue: string
  manualProgress: string
  startDate: string
  dueDate: string
}

function goalToForm(g: EditableGoal): GoalFieldState {
  return {
    kind: g.kind,
    name: g.name,
    description: g.description,
    targetValue: g.kind === 'manual' ? '100' : String(g.targetValue),
    thresholdValue: g.thresholdValue === null ? '' : String(g.thresholdValue),
    manualProgress: g.manualProgress === null ? '0' : String(g.manualProgress),
    startDate: g.startDate,
    dueDate: g.dueDate,
  }
}

function emptyForm(): GoalFieldState {
  return {
    kind: 'ganancia',
    name: '',
    description: '',
    targetValue: '',
    thresholdValue: '',
    // Un objetivo manual recién creado arranca en 0% — el campo se muestra deshabilitado
    // en modo crear (ver JSX) y solo se vuelve editable al editar (resolución del brief).
    manualProgress: '0',
    startDate: todayLocalISO(),
    dueDate: '',
  }
}

function FieldErrorText({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="flex flex-col gap-[2px]">
      {errors.map((msg) => (
        <span key={msg} className="text-neg" style={{ fontSize: '11px' }}>
          {msg}
        </span>
      ))}
    </div>
  )
}

type GoalFormProps = { mode: 'create'; studentId: string } | { mode: 'edit'; goal: EditableGoal }

/**
 * Modal ligero de creación/edición de objetivos (Task 14), montado por la página mentor
 * `/objetivos-estudiantes` a partir de `?nuevo=1` o `?editar=<goalId>`. Client component
 * (a diferencia de `DayTradesPanel`, que es de solo lectura): necesita `onChange` por
 * campo — al elegir `kind` se muestran/ocultan `thresholdValue` (solo `riesgo_diario`) y
 * `manualProgress` (solo `manual`, y solo editable en modo editar) — más envío a
 * `createGoal`/`updateGoal` con `fieldErrors` inline.
 *
 * Valida con `goalSchema` en el cliente ANTES de llamar al server action (feedback
 * inmediato sin round-trip); el server vuelve a validar exactamente lo mismo (nunca se
 * confía en la validación del cliente) y sus `fieldErrors`, si los hay, sobrescriben los
 * del cliente de la misma forma.
 *
 * Cierre (Cancelar/✕/Escape/backdrop) solo quita `nuevo`/`editar` de la URL — preserva
 * `?e=<studentId>` para no perder la selección de alumno.
 */
export function GoalForm(props: GoalFormProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState<GoalFieldState>(() => (props.mode === 'edit' ? goalToForm(props.goal) : emptyForm()))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Guardas contra doble click físico en "Eliminar" — mismo patrón que `TradeModal`
  // (ver su doc): el segundo click de un dblclick puede caer ya con `confirmDelete=true`
  // y disparar el borrado sin que el usuario haya decidido confirmar de verdad.
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

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    contentRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [])

  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('nuevo')
    params.delete('editar')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  // Escape cierra el modal. El mismo listener implementa el focus trap del diálogo:
  // Tab/Shift+Tab en los bordes de la lista de focusables cicla al otro extremo en vez de
  // escapar hacia la página de debajo (que sigue en el DOM detrás del backdrop) — sin esto,
  // un usuario de teclado podría tabular fuera del modal hacia elementos interactivos de la
  // página oculta tras `role="dialog" aria-modal="true"`, que exige contención de foco.
  // Mismo patrón EXACTO que `TradeModal` (ver su doc): la lista de focusables se recalcula
  // en cada Tab (no se cachea) para quedar correcta sin importar qué campos estén
  // mostrados/ocultos en ese momento (p. ej. tras cambiar `kind`).
  //
  // `closeRef` deja que este efecto se registre UNA sola vez (deps `[]`) sin quedarse con
  // una versión obsoleta de `close` — que cambia en cada render porque depende de
  // `pathname`/`searchParams` — siempre invoca la versión más reciente vía la ref,
  // actualizada en el efecto de abajo (que sí corre en cada render).
  const closeRef = useRef<() => void>(() => {})
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    function getFocusables(dialog: HTMLElement): HTMLElement[] {
      const candidates = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      // `offsetParent === null` descarta lo oculto por `display:none`/no-renderizado (p. ej.
      // los campos condicionales por `kind` que no están montados) — un elemento así no es
      // alcanzable con Tab en un navegador real, así que tampoco debe contar para el ciclo.
      // También descarta lo deshabilitado, que no puede recibir foco.
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

  function updateField<K extends keyof GoalFieldState>(name: K, value: GoalFieldState[K]) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleKindChange(kind: DbGoal['kind']) {
    setFieldErrors({})
    // 'manual' fija el target a 100 de forma implícita (no hay campo visible para él,
    // ver JSX) — el progreso manual (0-100) se interpreta directamente como % de avance.
    setForm((prev) => ({ ...prev, kind, targetValue: kind === 'manual' ? '100' : prev.targetValue }))
  }

  function buildRaw(): unknown {
    return { ...form }
  }

  /** `true` solo si el campo tiene al menos un mensaje de error (un array vacío no cuenta). */
  function invalid(name: keyof GoalFieldState): boolean | undefined {
    const errs = fieldErrors[name]
    return errs && errs.length > 0 ? true : undefined
  }

  /**
   * `true` si el campo `name` NO se renderiza para `kind` (ver JSX: `targetValue` se oculta
   * en 'manual'; `thresholdValue` solo se muestra en 'riesgo_diario'; `manualProgress` solo
   * en 'manual'). Usado por `handleSubmit` para detectar el caso "hay un error de
   * validación en un campo que el usuario no puede ver" — sin este chequeo, `fieldErrors`
   * se pondría en un campo invisible y "Guardar" parecería no hacer nada (bundle B del
   * review de Task 14).
   */
  function isFieldHidden(name: keyof GoalFieldState, kind: DbGoal['kind']): boolean {
    if (name === 'targetValue') return kind === 'manual'
    if (name === 'thresholdValue') return kind !== 'riesgo_diario'
    if (name === 'manualProgress') return kind !== 'manual'
    return false
  }

  function handleSubmit() {
    setFormError(null)

    const raw = buildRaw()
    const parsed = goalSchema.safeParse(raw)
    if (!parsed.success) {
      const errs = z.flattenError(parsed.error).fieldErrors
      setFieldErrors(errs)
      // Ningún error debería caer aquí en la práctica (los campos ocultos por `kind` se
      // fijan a valores siempre válidos, ver `handleKindChange`/`goalToForm`), pero es un
      // caso silencioso si algo cambia — mejor un aviso genérico que un "Guardar" que no
      // hace nada visible.
      const hasHiddenError = Object.keys(errs).some((key) => isFieldHidden(key as keyof GoalFieldState, form.kind))
      if (hasHiddenError) {
        setFormError('Revisa los campos del tipo seleccionado')
      }
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = props.mode === 'create' ? await createGoal(props.studentId, raw) : await updateGoal(props.goal.id, raw)
        if (!result.ok) {
          if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
            setFieldErrors(result.fieldErrors)
          } else {
            setFormError(result.error)
          }
          return
        }
        close()
        router.refresh()
      } catch {
        setFormError(ERROR_INESPERADO)
      }
    })
  }

  function handleDeleteClick() {
    if (props.mode !== 'edit') return

    if (!confirmDelete) {
      setConfirmDelete(true)
      armedAtRef.current = Date.now()
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = setTimeout(disarmDelete, DELETE_AUTO_DISARM_MS)
      return
    }

    if (Date.now() - armedAtRef.current < DELETE_IGNORE_MS) return

    if (disarmTimerRef.current) {
      clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = null
    }
    setFormError(null)
    startTransition(async () => {
      try {
        const result = await removeGoal(props.goal.id)
        if (!result.ok) {
          setConfirmDelete(false)
          setFormError(result.error)
          return
        }
        close()
        router.refresh()
      } catch {
        setConfirmDelete(false)
        setFormError(ERROR_INESPERADO)
      }
    })
  }

  const isEdit = props.mode === 'edit'
  const title = isEdit ? 'Editar objetivo' : 'Nuevo objetivo'

  return (
    <>
      <style>{`
        .goalform-backdrop {
          position: fixed; inset: 0; z-index: 60;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 44px 20px; overflow: auto;
          background: color-mix(in oklab, var(--color-neutral-900) 72%, transparent);
          backdrop-filter: blur(3px);
        }
        .goalform-dialog {
          width: min(560px, 100%); max-height: calc(100vh - 88px);
          background: var(--color-neutral-900); border: 1px solid var(--color-neutral-700);
          border-radius: 14px; box-shadow: var(--shadow-lg);
          display: flex; flex-direction: column; overflow: hidden;
          animation: smRise .22s ease both;
        }
        .goalform-content { overflow-y: auto; }
      `}</style>

      <div className="goalform-backdrop" onClick={close}>
        <div
          ref={dialogRef}
          className="goalform-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="goalform-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-[14px] border-b border-neutral-800 px-[22px] py-[18px]">
            <span
              id="goalform-title"
              className="text-[15px]"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
            >
              {title}
            </span>
            <button type="button" onClick={close} aria-label="Cerrar" className="btn btn-ghost btn-icon ml-auto" style={{ width: '30px', height: '30px' }}>
              ✕
            </button>
          </div>

          <div ref={contentRef} className="goalform-content flex flex-col gap-[14px] px-[22px] py-[18px]">
            <fieldset disabled={isPending} style={{ display: 'contents', border: 0, margin: 0, padding: 0 }}>
              <div className="field">
                <label htmlFor="goal-name">Nombre *</label>
                <input
                  id="goal-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  aria-invalid={invalid('name')}
                />
                <FieldErrorText errors={fieldErrors.name} />
              </div>

              <div className="field">
                <label htmlFor="goal-description">Descripción</label>
                <textarea
                  id="goal-description"
                  className="input"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  aria-invalid={invalid('description')}
                />
                <FieldErrorText errors={fieldErrors.description} />
              </div>

              <div className="field">
                <label htmlFor="goal-kind">Tipo de objetivo *</label>
                <select
                  id="goal-kind"
                  className="input"
                  value={form.kind}
                  onChange={(e) => handleKindChange(e.target.value as DbGoal['kind'])}
                  aria-invalid={invalid('kind')}
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <FieldErrorText errors={fieldErrors.kind} />
              </div>

              <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {form.kind !== 'manual' ? (
                  <div className="field">
                    <label htmlFor="goal-target">{targetValueLabel(form.kind)} *</label>
                    <input
                      id="goal-target"
                      type="number"
                      step="any"
                      className="input tabular-nums"
                      value={form.targetValue}
                      onChange={(e) => updateField('targetValue', e.target.value)}
                      aria-invalid={invalid('targetValue')}
                    />
                    <FieldErrorText errors={fieldErrors.targetValue} />
                  </div>
                ) : null}

                {form.kind === 'riesgo_diario' ? (
                  <div className="field">
                    <label htmlFor="goal-threshold">Umbral máx. de riesgo diario (%) *</label>
                    <input
                      id="goal-threshold"
                      type="number"
                      step="any"
                      className="input tabular-nums"
                      value={form.thresholdValue}
                      onChange={(e) => updateField('thresholdValue', e.target.value)}
                      aria-invalid={invalid('thresholdValue')}
                    />
                    <FieldErrorText errors={fieldErrors.thresholdValue} />
                  </div>
                ) : null}

                {form.kind === 'manual' ? (
                  <div className="field">
                    <label htmlFor="goal-manual-progress">Progreso manual (%) *</label>
                    <input
                      id="goal-manual-progress"
                      type="number"
                      step="any"
                      className="input tabular-nums"
                      value={form.manualProgress}
                      onChange={(e) => updateField('manualProgress', e.target.value)}
                      disabled={!isEdit}
                      aria-invalid={invalid('manualProgress')}
                    />
                    {!isEdit ? (
                      <span className="text-[11px] text-neutral-500">Empieza en 0% — se actualiza al editar el objetivo</span>
                    ) : null}
                    <FieldErrorText errors={fieldErrors.manualProgress} />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div className="field">
                  <label htmlFor="goal-start">Fecha de inicio *</label>
                  <input
                    id="goal-start"
                    type="date"
                    className="input"
                    value={form.startDate}
                    onChange={(e) => updateField('startDate', e.target.value)}
                    aria-invalid={invalid('startDate')}
                  />
                  <FieldErrorText errors={fieldErrors.startDate} />
                </div>
                <div className="field">
                  <label htmlFor="goal-due">Fecha de vencimiento *</label>
                  <input
                    id="goal-due"
                    type="date"
                    className="input"
                    value={form.dueDate}
                    onChange={(e) => updateField('dueDate', e.target.value)}
                    aria-invalid={invalid('dueDate')}
                  />
                  <FieldErrorText errors={fieldErrors.dueDate} />
                </div>
              </div>
            </fieldset>

            {formError ? (
              <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
                {formError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-[10px] border-t border-neutral-800 px-[22px] py-[14px]">
            {isEdit ? (
              <button type="button" onClick={handleDeleteClick} disabled={isPending} className="btn btn-ghost text-[12px]" style={{ color: 'var(--neg)' }}>
                {confirmDelete ? '¿Seguro? Eliminar definitivamente' : 'Eliminar'}
              </button>
            ) : null}

            <div className="ml-auto flex gap-[8px]">
              <button type="button" onClick={close} className="btn btn-ghost text-[12px]">
                Cancelar
              </button>
              <button type="button" onClick={handleSubmit} disabled={isPending} className="btn btn-primary text-[12px]">
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
