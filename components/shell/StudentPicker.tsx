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
 *
 * `queryPath` (Task 14, corregido tras un crash en producción — ver "Concerns" del report
 * de Task 14) generaliza el destino para páginas cuya selección de alumno vive en un query
 * param sobre la MISMA ruta (`/objetivos-estudiantes?e=<id>`, `/niveles?e=<id>`) en vez de un
 * segmento `[id]` de la URL. Es un STRING (el pathname, p. ej. `'/objetivos-estudiantes'`),
 * NUNCA una función: este componente es `'use client'`, así que sus props llegan desde un
 * Server Component a través del boundary serializable de React Server Components — Next.js
 * prohíbe pasar funciones ahí ("Functions cannot be passed directly to Client Components"),
 * y ese error solo aparece en RUNTIME (ni `tsc` ni `next build` lo detectan, porque el tipo
 * de una función es perfectamente válido en TypeScript; el chequeo de serializabilidad de
 * React ocurre en el render, no en la compilación). La variante anterior (`hrefFor: (id) =>
 * string`) causó exactamente ese crash en `/objetivos-estudiantes` y `/niveles` — fue
 * eliminada por completo, no debe reintroducirse. El propio componente construye el href
 * (`${queryPath}?e=${id}`), no el caller.
 */
type StudentPickerNav = { subroute: 'dashboard' | 'calendario'; queryPath?: never } | { subroute?: never; queryPath: string }

export function StudentPicker({
  students,
  currentId,
  ...nav
}: {
  students: Pick<DbUser, 'id' | 'name'>[]
  currentId: string
} & StudentPickerNav) {
  const router = useRouter()

  function hrefFor(id: string): string {
    return nav.queryPath ? `${nav.queryPath}?e=${id}` : `/estudiantes/${id}/${nav.subroute}`
  }

  return (
    <div
      className="flex items-center gap-[8px] rounded-[8px] px-[10px] py-[6px]"
      style={{ border: '1px solid var(--color-neutral-800)' }}
    >
      <span className="text-[11px] text-neutral-500">Viendo a</span>
      <select
        aria-label="Viendo a"
        value={currentId}
        onChange={(e) => router.push(hrefFor(e.target.value))}
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
