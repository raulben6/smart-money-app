'use client'

import { useState, useTransition } from 'react'
import { z } from 'zod'
import { sendFeedback } from '@/lib/actions/mentor'
import { feedbackSchema } from '@/lib/validation/mentor'
import type { DbNotification } from '@/lib/db/schema'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

const KIND_OPTIONS: { value: DbNotification['kind']; label: string }[] = [
  { value: 'felicitacion', label: 'Felicitación' },
  { value: 'correccion', label: 'Corrección' },
  { value: 'recordatorio', label: 'Recordatorio' },
  { value: 'observacion', label: 'Observación' },
  { value: 'progreso', label: 'Progreso' },
]

type FeedbackFieldState = { kind: DbNotification['kind']; title: string; body: string }

function emptyForm(): FeedbackFieldState {
  return { kind: 'felicitacion', title: '', body: '' }
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

/**
 * Sección 'Retroalimentación del mentor' (Task 16, mockup 524-529), montada dentro de
 * `ReadOnlyJournal` (`TradeModal` en modo mentor, Task 12) para el trade que el modal tiene
 * abierto en ese momento. Envía `sendFeedback(studentId, { kind, title, body, tradeId })` —
 * la action verifica del lado del servidor que `tradeId` pertenezca a `studentId`
 * (hallazgo de seguridad del revisor de Task 9, corregido en esta misma Task 16, ver
 * `lib/actions/mentor.ts`), así que esta sección no repite esa validación por su cuenta:
 * siempre pasa el `tradeId` del trade que el modal ya tiene abierto para ESE alumno.
 *
 * Sin toast ni cierre del modal al enviar: éxito -> aviso inline 'Enviado ✓' y limpia los
 * campos (el mentor puede seguir viendo el trade o mandar otra nota inmediatamente).
 */
export function FeedbackSection({ studentId, tradeId }: { studentId: string; tradeId: string }) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<FeedbackFieldState>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function updateField<K extends keyof FeedbackFieldState>(name: K, value: FeedbackFieldState[K]) {
    setSent(false)
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function invalid(name: keyof FeedbackFieldState): boolean | undefined {
    const errs = fieldErrors[name]
    return errs && errs.length > 0 ? true : undefined
  }

  function handleSubmit() {
    setFormError(null)
    setSent(false)

    const raw = { ...form, tradeId }
    const parsed = feedbackSchema.safeParse(raw)
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = await sendFeedback(studentId, raw)
        if (!result.ok) {
          if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
            setFieldErrors(result.fieldErrors)
          } else {
            setFormError(result.error)
          }
          return
        }
        setForm(emptyForm())
        setSent(true)
      } catch {
        setFormError(ERROR_INESPERADO)
      }
    })
  }

  return (
    <section
      className="flex flex-col gap-[10px]"
      style={{ borderTop: '1px solid var(--color-neutral-800)', paddingTop: '16px' }}
    >
      <h3 className="m-0 text-[11px] tracking-[0.13em] uppercase" style={{ color: 'var(--color-accent-300)' }}>
        Retroalimentación del mentor
      </h3>

      <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="field">
          <label htmlFor="feedback-kind">Tipo *</label>
          <select
            id="feedback-kind"
            className="input"
            value={form.kind}
            disabled={isPending}
            onChange={(e) => updateField('kind', e.target.value as DbNotification['kind'])}
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

        <div className="field">
          <label htmlFor="feedback-title">Título *</label>
          <input
            id="feedback-title"
            className="input"
            value={form.title}
            disabled={isPending}
            onChange={(e) => updateField('title', e.target.value)}
            aria-invalid={invalid('title')}
          />
          <FieldErrorText errors={fieldErrors.title} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="feedback-body">Mensaje *</label>
        <textarea
          id="feedback-body"
          rows={3}
          className="input"
          placeholder="Escribe tu observación. Llegará al centro de notificaciones del estudiante."
          value={form.body}
          disabled={isPending}
          onChange={(e) => updateField('body', e.target.value)}
          style={{ borderColor: 'var(--color-accent-800)', resize: 'vertical' }}
          aria-invalid={invalid('body')}
        />
        <FieldErrorText errors={fieldErrors.body} />
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[11.5px] text-neutral-500">Tu comentario llegará al estudiante al guardar</span>
        <div className="ml-auto flex items-center gap-[10px]">
          {sent ? <span className="text-pos text-[12px]">Enviado ✓</span> : null}
          <button type="button" onClick={handleSubmit} disabled={isPending} className="btn btn-primary text-[12px]">
            {isPending ? 'Enviando…' : 'Enviar retroalimentación'}
          </button>
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
          {formError}
        </p>
      ) : null}
    </section>
  )
}
