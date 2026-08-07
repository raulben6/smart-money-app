'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { inviteStudent } from '@/lib/actions/mentor'
import { inviteSchema } from '@/lib/validation/mentor'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/**
 * Form inline (NO modal — a diferencia de `GoalForm`/`FeedbackSection`, esta pantalla no
 * necesita diálogo ni focus trap, ver resolución del controlador F2-T17) para invitar a un
 * estudiante por correo (Task 17). Valida con `inviteSchema` en el cliente antes de llamar a
 * `inviteStudent` (mismo criterio que el resto de forms de esta app: feedback inmediato sin
 * round-trip; el server vuelve a validar y sus `fieldErrors`/`error`, si los hay, sobrescriben
 * los del cliente).
 *
 * Al éxito: limpia el campo, muestra 'Invitación enviada ✓' en un `aria-live="polite"` SIEMPRE
 * montado (mismo patrón que `FeedbackSection` — un lector de pantalla no anuncia un nodo
 * `aria-live` recién insertado, solo un CAMBIO de texto en uno que ya estaba presente) y llama
 * `router.refresh()` para que la tabla de invitaciones, renderizada server-side por la página
 * a partir de `getInvitationList` (`lib/clerk-invitations.ts`), recoja la nueva fila sin que
 * este componente necesite guardar su propia copia de la lista.
 */
export function InviteForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function updateEmail(value: string) {
    setEmail(value)
    setSent(false)
    setFieldErrors({})
    setFormError(null)
  }

  function handleSubmit() {
    setFormError(null)
    setSent(false)

    const raw = { email }
    const parsed = inviteSchema.safeParse(raw)
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = await inviteStudent(raw)
        if (!result.ok) {
          if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
            setFieldErrors(result.fieldErrors)
          } else {
            setFormError(result.error)
          }
          return
        }
        setSent(true)
        setEmail('')
        router.refresh()
      } catch {
        setFormError(ERROR_INESPERADO)
      }
    })
  }

  const invalidEmail = fieldErrors.email && fieldErrors.email.length > 0 ? true : undefined

  return (
    <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
      <h2 style={{ margin: 0, fontSize: '14px' }}>Invitar por correo</h2>

      <fieldset disabled={isPending} style={{ display: 'contents', border: 0, margin: 0, padding: 0 }}>
        <div className="flex flex-wrap items-end gap-[10px]">
          <div className="field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="invite-email">Correo del estudiante</label>
            <input
              id="invite-email"
              type="email"
              required
              className="input"
              placeholder="estudiante@correo.com"
              value={email}
              onChange={(e) => updateEmail(e.target.value)}
              aria-invalid={invalidEmail}
            />
          </div>
          <button type="button" onClick={handleSubmit} disabled={isPending} className="btn btn-primary text-[12px]">
            {isPending ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      </fieldset>

      {fieldErrors.email && fieldErrors.email.length > 0 ? (
        <div className="flex flex-col gap-[2px]">
          {fieldErrors.email.map((msg) => (
            <span key={msg} className="text-neg" style={{ fontSize: '11px' }}>
              {msg}
            </span>
          ))}
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
          {formError}
        </p>
      ) : null}

      {/* `aria-live="polite"` en un span SIEMPRE montado — mismo patrón que `FeedbackSection`
          (ver su doc): algunos lectores de pantalla no anuncian un nodo `aria-live` recién
          insertado en el DOM, solo un CAMBIO de texto en uno que ya estaba presente. */}
      <span aria-live="polite" className="text-pos m-0" style={{ fontSize: '12px' }}>
        {sent ? 'Invitación enviada ✓' : ''}
      </span>
    </div>
  )
}
