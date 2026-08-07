import Link from 'next/link'

const ITEMS: { key: 'dashboard' | 'calendario'; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'calendario', label: 'Calendario' },
]

/**
 * Conmutador Dashboard/Calendario del header de `/estudiantes/[id]/...` (Task 12 — fix de
 * navegación tras el smoke test del usuario: sin esto, la única vía hacia el calendario del
 * alumno era el enlace 'Ver calendario' de `RecentTrades`, que desaparece por completo en el
 * estado vacío). Server component: son enlaces reales entre dos páginas distintas, no un
 * toggle de estado en cliente.
 *
 * Estilo del segmentado "Vista del prototipo" del mockup (líneas 53-56): contenedor con
 * borde + padding + gap, cada opción con fondo/color de acento cuando está activa (mismo
 * patrón visual que el item activo de `MentorSidebar`, `--color-accent-900`/
 * `--color-accent-200`). `aria-current="page"` marca la pestaña activa, igual que el resto
 * de la navegación de la app.
 */
export function StudentViewTabs({ studentId, active }: { studentId: string; active: 'dashboard' | 'calendario' }) {
  return (
    <div className="flex items-center gap-[4px] rounded-[9px] p-[3px]" style={{ border: '1px solid var(--color-neutral-800)' }}>
      {ITEMS.map((item) => {
        const isActive = item.key === active
        return (
          <Link
            key={item.key}
            href={`/estudiantes/${studentId}/${item.key}`}
            aria-current={isActive ? 'page' : undefined}
            className="rounded-[7px] px-[10px] py-[6px] text-[11.5px]"
            style={{
              background: isActive ? 'var(--color-accent-900)' : 'transparent',
              color: isActive ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
            }}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
