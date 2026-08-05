'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import type { DbLevel } from '@/lib/db/schema'
import { updateLevel, grantStudentLevel, revokeStudentLevel } from '@/lib/actions/mentor'
import { levelSchema } from '@/lib/validation/mentor'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

type LevelFieldState = {
  name: string
  goalAmount: string
  minProfitFactor: string
  minTrades: string
  maxDrawdownPct: string
}

function levelToForm(l: DbLevel): LevelFieldState {
  return {
    name: l.name,
    goalAmount: String(l.goalAmount),
    minProfitFactor: l.minProfitFactor === null ? '' : String(l.minProfitFactor),
    minTrades: l.minTrades === null ? '' : String(l.minTrades),
    maxDrawdownPct: l.maxDrawdownPct === null ? '' : String(l.maxDrawdownPct),
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

/**
 * Una fila editable de `LevelRows` (mockup 335-343, aquí en forma de tarjeta en vez de
 * carrusel — este es el editor del mentor, no la vista del alumno): nombre, meta $, PF
 * mínimo, trades mínimos, drawdown máximo, con guardado independiente por fila (`Guardar`
 * -> `updateLevel`). Valida con `levelSchema` en el cliente antes del server action (mismo
 * criterio que `GoalForm`); el server vuelve a validar y sus `fieldErrors` sobrescriben los
 * del cliente si los hay.
 *
 * `position`/`manualUnlock` NO son editables aquí (`levelSchema` no los declara — ver
 * `lib/validation/mentor.ts` — son estructurales del programa, fijados por el seed).
 */
function LevelRow({ level }: { level: DbLevel }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState<LevelFieldState>(() => levelToForm(level))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  function updateField<K extends keyof LevelFieldState>(name: K, value: LevelFieldState[K]) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function invalid(name: keyof LevelFieldState): boolean | undefined {
    const errs = fieldErrors[name]
    return errs && errs.length > 0 ? true : undefined
  }

  function handleSave() {
    setFormError(null)
    setSaved(false)

    const raw = { ...form }
    const parsed = levelSchema.safeParse(raw)
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors)
      return
    }
    setFieldErrors({})

    startTransition(async () => {
      try {
        const result = await updateLevel(level.id, raw)
        if (!result.ok) {
          if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
            setFieldErrors(result.fieldErrors)
          } else {
            setFormError(result.error)
          }
          return
        }
        setSaved(true)
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaved(false), 2500)
        router.refresh()
      } catch {
        setFormError(ERROR_INESPERADO)
      }
    })
  }

  return (
    <div className="card" style={{ padding: '16px 18px', gap: '10px' }}>
      <fieldset disabled={isPending} style={{ display: 'contents', border: 0, margin: 0, padding: 0 }}>
        <div className="flex items-center gap-[10px]">
          <span className="tag tag-outline" style={{ fontSize: '10px' }}>
            Nivel {level.position}
          </span>
          {level.manualUnlock ? <span className="text-[11px] text-neutral-500">Desbloqueo manual</span> : null}
          {saved ? (
            <span className="text-[11px]" style={{ color: 'var(--pos)', marginLeft: 'auto' }}>
              Guardado
            </span>
          ) : null}
        </div>

        <div className="grid gap-[10px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="field">
            <label htmlFor={`level-name-${level.id}`}>Nombre</label>
            <input
              id={`level-name-${level.id}`}
              className="input"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              aria-invalid={invalid('name')}
            />
            <FieldErrorText errors={fieldErrors.name} />
          </div>

          <div className="field">
            <label htmlFor={`level-goal-${level.id}`}>Meta ($)</label>
            <input
              id={`level-goal-${level.id}`}
              type="number"
              step="any"
              className="input tabular-nums"
              value={form.goalAmount}
              onChange={(e) => updateField('goalAmount', e.target.value)}
              aria-invalid={invalid('goalAmount')}
            />
            <FieldErrorText errors={fieldErrors.goalAmount} />
          </div>

          <div className="field">
            <label htmlFor={`level-pf-${level.id}`}>PF mínimo</label>
            <input
              id={`level-pf-${level.id}`}
              type="number"
              step="any"
              className="input tabular-nums"
              value={form.minProfitFactor}
              onChange={(e) => updateField('minProfitFactor', e.target.value)}
              aria-invalid={invalid('minProfitFactor')}
            />
            <FieldErrorText errors={fieldErrors.minProfitFactor} />
          </div>

          <div className="field">
            <label htmlFor={`level-trades-${level.id}`}>Trades mínimos</label>
            <input
              id={`level-trades-${level.id}`}
              type="number"
              step="1"
              className="input tabular-nums"
              value={form.minTrades}
              onChange={(e) => updateField('minTrades', e.target.value)}
              aria-invalid={invalid('minTrades')}
            />
            <FieldErrorText errors={fieldErrors.minTrades} />
          </div>

          <div className="field">
            <label htmlFor={`level-dd-${level.id}`}>Drawdown máx. (%)</label>
            <input
              id={`level-dd-${level.id}`}
              type="number"
              step="any"
              className="input tabular-nums"
              value={form.maxDrawdownPct}
              onChange={(e) => updateField('maxDrawdownPct', e.target.value)}
              aria-invalid={invalid('maxDrawdownPct')}
            />
            <FieldErrorText errors={fieldErrors.maxDrawdownPct} />
          </div>
        </div>
      </fieldset>

      {formError ? (
        <p role="alert" className="text-neg m-0" style={{ fontSize: '12px' }}>
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={isPending} className="btn btn-primary" style={{ fontSize: '12px' }}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

/**
 * Fila de "Desbloqueo manual" para UN nivel `manualUnlock` y el alumno seleccionado:
 * estado (Otorgado/Pendiente) + botón Otorgar/Revocar. "Revocar" lleva guarda de doble
 * click (mismo patrón que `GoalForm.handleDeleteClick`: un primer click arma la
 * confirmación, un segundo click — pasados al menos 400ms, para no contar el segundo
 * click de un doble click físico como confirmación — revoca de verdad; se autodesarma a
 * los 4s). "Otorgar" es idempotente (`grantLevel` usa `onConflictDoNothing`) y no
 * necesita esa guarda.
 */
function ManualUnlockRow({ level, studentId, granted }: { level: DbLevel; studentId: string; granted: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const armedAtRef = useRef(0)
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const REVOKE_IGNORE_MS = 400
  const REVOKE_AUTO_DISARM_MS = 4000

  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    }
  }, [])

  function disarmRevoke() {
    setConfirmRevoke(false)
    if (disarmTimerRef.current) {
      clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = null
    }
  }

  function handleGrant() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await grantStudentLevel(studentId, level.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.refresh()
      } catch {
        setError(ERROR_INESPERADO)
      }
    })
  }

  function handleRevokeClick() {
    if (!confirmRevoke) {
      setConfirmRevoke(true)
      armedAtRef.current = Date.now()
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = setTimeout(disarmRevoke, REVOKE_AUTO_DISARM_MS)
      return
    }

    if (Date.now() - armedAtRef.current < REVOKE_IGNORE_MS) return

    disarmRevoke()
    setError(null)
    startTransition(async () => {
      try {
        const result = await revokeStudentLevel(studentId, level.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.refresh()
      } catch {
        setError(ERROR_INESPERADO)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-[12px]" style={{ padding: '10px 0', borderBottom: '1px solid var(--color-neutral-800)' }}>
      <span className="flex-1" style={{ minWidth: '160px' }}>
        {level.name}
      </span>
      <span className="text-[11px]" style={{ color: granted ? 'var(--pos)' : 'var(--color-neutral-500)' }}>
        {granted ? 'Otorgado' : 'Pendiente'}
      </span>
      {error ? (
        <span className="text-neg" style={{ fontSize: '11px' }}>
          {error}
        </span>
      ) : null}
      {granted ? (
        <button
          type="button"
          onClick={handleRevokeClick}
          disabled={isPending}
          className="btn btn-ghost"
          style={{ fontSize: '11px', color: 'var(--neg)' }}
        >
          {confirmRevoke ? '¿Seguro? Revocar' : 'Revocar'}
        </button>
      ) : (
        <button type="button" onClick={handleGrant} disabled={isPending} className="btn btn-primary" style={{ fontSize: '11px' }}>
          Otorgar
        </button>
      )}
    </div>
  )
}

/**
 * `/niveles` (Task 15): lista editable de los 5 niveles del programa + sección
 * "Desbloqueo manual" para otorgar/revocar los niveles `manualUnlock` a un alumno
 * concreto. `studentId`/`grantedLevelIds` llegan ya resueltos por la página a partir de
 * `?e=<id>` (mismo patrón de `StudentPicker` que `/objetivos-estudiantes`, Task 14) — esta
 * pieza NO gestiona la selección de alumno, solo consume el resultado.
 *
 * `hasStudents=false` (el mentor todavía no invitó a ningún alumno) oculta la sección de
 * desbloqueo manual por completo: no hay a quién otorgarle nada.
 */
export function LevelEditor({
  levels,
  studentId,
  grantedLevelIds,
  hasStudents,
}: {
  levels: DbLevel[]
  studentId: string | null
  grantedLevelIds: string[]
  hasStudents: boolean
}) {
  const manualLevels = levels.filter((l) => l.manualUnlock)

  return (
    <>
      <div className="flex flex-col gap-[12px]">
        {levels.map((level) => (
          <LevelRow key={level.id} level={level} />
        ))}
      </div>

      <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '14px' }}>Desbloqueo manual</h2>

        {!hasStudents ? (
          <div className="flex flex-col items-center gap-[10px] text-center" style={{ padding: '24px 12px' }}>
            <p className="m-0 text-[13px] text-neutral-400">Invita a tu primer estudiante para poder otorgarle niveles.</p>
            <Link href="/invitaciones" className="btn btn-primary" style={{ fontSize: '12px' }}>
              Invitar estudiante
            </Link>
          </div>
        ) : manualLevels.length === 0 ? (
          <p className="m-0 text-[13px] text-neutral-400">Ningún nivel del programa requiere desbloqueo manual.</p>
        ) : studentId ? (
          <div className="flex flex-col">
            {manualLevels.map((level) => (
              <ManualUnlockRow key={level.id} level={level} studentId={studentId} granted={grantedLevelIds.includes(level.id)} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
