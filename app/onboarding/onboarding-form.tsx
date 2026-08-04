'use client'

import { useActionState } from 'react'
import { completeOnboarding } from '@/lib/actions/onboarding'
import type { ActionResult } from '@/lib/actions/types'

const initialState: ActionResult<null> = { ok: true, data: null }

async function action(_prevState: ActionResult<null>, formData: FormData) {
  return completeOnboarding(formData)
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(action, initialState)
  const fieldErrors = !state.ok ? state.fieldErrors?.initialBalance : undefined

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="field">
        <label htmlFor="initialBalance">Balance inicial</label>
        <input
          id="initialBalance"
          name="initialBalance"
          type="number"
          step="0.01"
          className="input"
          required
        />
        {fieldErrors?.map((msg) => (
          <p key={msg} className="text-neg text-xs mt-1">{msg}</p>
        ))}
      </div>
      {!state.ok && !fieldErrors && <p className="text-neg text-xs">{state.error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Guardando…' : 'Comenzar'}
      </button>
    </form>
  )
}
