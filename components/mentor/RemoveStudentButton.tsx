'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeStudent } from '@/lib/actions/mentor'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/**
 * Baja del programa (ronda 17) con confirmación en dos pasos (mismo patrón de
 * desarme que el borrado de trades): el primer clic arma el botón durante unos
 * segundos; el segundo ejecuta. Al confirmar, el estudiante pierde el acceso
 * (Clerk) y queda ARCHIVADO — sus datos se conservan y, si su correo se
 * re-invita, recupera su historial. Tras la baja se navega al panel (la vista
 * actual deja de existir para el mentor).
 */
export function RemoveStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
    }
  }, [])

  function onClick() {
    setError(null)
    if (!armed) {
      setArmed(true)
      if (disarmTimerRef.current) clearTimeout(disarmTimerRef.current)
      disarmTimerRef.current = setTimeout(() => setArmed(false), 5000)
      return
    }

    startTransition(async () => {
      const result = await removeStudent(studentId)
      if (!result.ok) {
        setArmed(false)
        setError(result.error ?? ERROR_INESPERADO)
        return
      }
      router.push('/panel')
      router.refresh()
    })
  }

  return (
    <span className="flex items-center gap-[8px]">
      {error ? (
        <span role="alert" className="text-neg text-[11px]">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-label={armed ? `Confirmar la baja de ${studentName}` : `Dar de baja a ${studentName}`}
        className="btn btn-ghost"
        style={{ fontSize: '11.5px', padding: '6px 11px', color: 'var(--neg)' }}
      >
        {isPending ? 'Dando de baja…' : armed ? '¿Confirmar baja?' : 'Dar de baja'}
      </button>
    </span>
  )
}
