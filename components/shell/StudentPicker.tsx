'use client'

import { useRouter } from 'next/navigation'
import type { DbUser } from '@/lib/db/schema'

/**
 * Selector "Viendo a" del header de `/estudiantes/[id]/dashboard|calendario` (mockup
 * líneas 74-83, Task 12): cambia de alumno navegando a la misma subruta para el alumno
 * elegido. Client component porque necesita `onChange` + `router.push` — la lista de
 * alumnos y el id actual llegan ya resueltos del server component que lo monta
 * (`listStudents`/`params.id`).
 *
 * `subroute` fija el destino a la ruta binding del ledger (`/estudiantes/[id]/dashboard` o
 * `/estudiantes/[id]/calendario`, ver Task 11) — cada página mentor pasa la suya, no la
 * deriva de `usePathname()`, para no depender de la forma exacta de la URL actual.
 */
export function StudentPicker({
  students,
  currentId,
  subroute,
}: {
  students: Pick<DbUser, 'id' | 'name'>[]
  currentId: string
  subroute: 'dashboard' | 'calendario'
}) {
  const router = useRouter()

  return (
    <div
      className="flex items-center gap-[8px] rounded-[8px] px-[10px] py-[6px]"
      style={{ border: '1px solid var(--color-neutral-800)' }}
    >
      <span className="text-[11px] text-neutral-500">Viendo a</span>
      <select
        aria-label="Viendo a"
        value={currentId}
        onChange={(e) => router.push(`/estudiantes/${e.target.value}/${subroute}`)}
        className="text-[12px]"
        style={{
          background: 'transparent',
          border: 0,
          color: 'var(--color-text)',
          fontFamily: 'var(--font-body)',
          outline: 'none',
        }}
      >
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  )
}
