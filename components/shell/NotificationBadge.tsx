/**
 * Pastilla de conteo de notificaciones no leídas. Ver mockup líneas 44-46
 * (bg-accent-800, text-accent-200, min-width 17px, border-radius 9px).
 *
 * Oculta (devuelve `null`) si `count <= 0` — nunca renderiza una pastilla vacía o "0".
 * El número va en `aria-label`, no solo en el texto visible: como este componente
 * siempre vive dentro de un <Link> cuyo nombre accesible es la concatenación de sus
 * descendientes, un lector de pantalla anuncia "{label del link} {count} sin leer"
 * en vez de depender de que el dígito aislado se interprete como conteo.
 *
 * `className` solo debe llevar posicionamiento/margen (p.ej. `ml-auto` en el sidebar,
 * `absolute -right-1.5 -top-1` en el nav móvil) — nunca tamaño, para no competir con
 * las clases de tamaño fijo de abajo bajo el orden de cascada de Tailwind.
 */
export function NotificationBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null

  return (
    <span
      aria-label={`${count} sin leer`}
      className={`flex h-[17px] min-w-[17px] items-center justify-center rounded-[9px] bg-accent-fill px-[5px] text-[10px] leading-none text-on-accent ${className}`}
    >
      {count}
    </span>
  )
}
