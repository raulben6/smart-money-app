'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DbLevel } from '@/lib/db/schema'
import { assignStudentLevel } from '@/lib/actions/mentor'

const ERROR_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/**
 * Asignación manual del nivel inicial del estudiante seleccionado (ronda 16):
 * por defecto todos arrancan en el Nivel 1; el mentor puede colocar a un
 * estudiante directamente en cualquier nivel del programa. La asignación es
 * POR ESTUDIANTE (a diferencia del editor de definiciones de arriba, que es
 * del programa completo) y el nivel asignado arranca desde cero: el progreso
 * de dinero se mide desde el momento de la asignación.
 */
export function LevelAssign({
  studentId,
  studentName,
  levels,
  currentPosition,
}: {
  studentId: string
  studentName: string
  levels: Pick<DbLevel, 'id' | 'position' | 'name'>[]
  currentPosition: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // El padre monta este componente con key={studentId}: cambiar de estudiante
  // en el picker REMONTA el formulario con la asignación del nuevo estudiante
  // (sin efectos de sincronización de estado).
  const [position, setPosition] = useState(String(currentPosition))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await assignStudentLevel(studentId, { position: Number(position) })
      if (!result.ok) {
        // Formulario de un solo campo: el error específico de `position` es más
        // útil que el genérico "Revisa los campos marcados".
        setError(result.fieldErrors?.position?.[0] ?? result.error ?? ERROR_INESPERADO)
        return
      }
      setSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500)
      router.refresh()
    })
  }

  const sorted = [...levels].sort((a, b) => a.position - b.position)

  return (
    <div className="card" style={{ padding: '16px 18px', gap: '10px' }}>
      <div className="flex flex-col gap-[2px]">
        <h2 style={{ margin: 0, fontSize: '14px' }}>Nivel del estudiante</h2>
        <span className="text-[11.5px] text-neutral-500">
          Ubica a {studentName} directamente en un nivel del programa — solo afecta a este estudiante
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <label htmlFor="nivel-inicial" className="text-[12px] text-neutral-400">
          Nivel inicial
        </label>
        <select
          id="nivel-inicial"
          className="input"
          style={{ width: 'auto', minWidth: '220px' }}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          disabled={isPending}
        >
          {sorted.map((l) => (
            <option key={l.id} value={l.position}>
              {l.position === 1 ? `${l.name} (predeterminado)` : l.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={isPending}>
          {isPending ? 'Asignando…' : 'Asignar nivel'}
        </button>
        <span role="status" aria-live="polite" className="text-[11.5px]">
          {saved ? <span style={{ color: 'var(--pos)' }}>Nivel asignado</span> : null}
          {error ? <span className="text-neg">{error}</span> : null}
        </span>
      </div>

      <span className="text-[11px] text-neutral-500">
        El nivel asignado arranca desde cero: el progreso de dinero se mide desde el momento de la asignación, y los
        niveles anteriores quedan marcados como completados por asignación.
      </span>
    </div>
  )
}
