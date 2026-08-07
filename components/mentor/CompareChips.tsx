'use client'

import { useRouter, usePathname } from 'next/navigation'

/**
 * Chips de selección de `/comparador` (mockup líneas 381-385, estilo 825-832): togglea
 * un estudiante dentro/fuera de la comparación. Client component porque necesita
 * `onClick` + navegación — el estado de selección vive en la URL (`?s=id1,id2`), no en
 * `useState`, para que sea compartible/recargable (resolución del controlador F2-T13).
 *
 * Si al togglear queda ninguna selección, `router.replace` navega SIN el parámetro `s`
 * — la página vuelve a resolver el default (todos si hay ≤3, los primeros 3 si no) vía
 * `resolveComparedIds`, en vez de mostrar un comparador vacío.
 */
export function CompareChips({
  students,
  selectedIds,
}: {
  students: { id: string; name: string }[]
  selectedIds: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()

  function toggle(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    const query = next.length > 0 ? `?s=${next.join(',')}` : ''
    router.replace(`${pathname}${query}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {students.map((s) => {
        const on = selectedIds.includes(s.id)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            aria-pressed={on}
            className={
              on
                ? 'rounded-[20px] border border-accent bg-accent-900 px-[13px] py-[7px] text-[12px] text-accent-200'
                : 'rounded-[20px] border border-neutral-700 bg-transparent px-[13px] py-[7px] text-[12px] text-neutral-400'
            }
          >
            {s.name}
          </button>
        )
      })}
    </div>
  )
}
