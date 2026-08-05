'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { SquaresFour, ArrowsLeftRight, Target, Medal, EnvelopeSimple, UserPlus, type Icon } from '@phosphor-icons/react'
import { Brand } from './Brand'

/**
 * `matchPrefixes`: rutas adicionales que también marcan el item como activo. Solo
 * "Panel general" lo usa — Task 12 añade `/estudiantes/[id]/...` (dashboard/calendario
 * de un alumno concreto, accesible vía "Abrir" desde el panel), y esas subrutas no
 * tienen item propio en la nav fija, así que deben resaltar "Panel general".
 */
const NAV_ITEMS: { href: string; label: string; Icon: Icon; matchPrefixes: string[] }[] = [
  { href: '/panel', label: 'Panel general', Icon: SquaresFour, matchPrefixes: ['/estudiantes/'] },
  { href: '/comparador', label: 'Comparador', Icon: ArrowsLeftRight, matchPrefixes: [] },
  { href: '/objetivos-estudiantes', label: 'Objetivos', Icon: Target, matchPrefixes: [] },
  { href: '/niveles', label: 'Niveles', Icon: Medal, matchPrefixes: [] },
  { href: '/mensajes', label: 'Mensajes', Icon: EnvelopeSimple, matchPrefixes: [] },
  { href: '/invitaciones', label: 'Invitaciones', Icon: UserPlus, matchPrefixes: [] },
]

/** Sidebar de escritorio del mentor (≥1024px). Calca `Sidebar.tsx`; nav propia (mockup línea 597, ver Task 11 report para la decisión de rutas). */
export function MentorSidebar({ name, initials }: { name: string; initials: string }) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-[22px] border-r border-neutral-800 px-[14px] py-[20px] lg:flex">
      <Brand />

      <nav aria-label="Navegación principal" className="flex flex-col gap-0.5">
        <span className="px-2 pb-2 text-[9.5px] uppercase tracking-[.14em] text-neutral-500">Mentor</span>

        {NAV_ITEMS.map(({ href, label, Icon, matchPrefixes }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`) || matchPrefixes.some((p) => pathname.startsWith(p))
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex items-center gap-[10px] rounded-md px-[9px] py-2 text-[12.5px] transition-colors bg-accent-900 text-accent-200 shadow-[inset_2px_0_0_var(--color-accent)]'
                  : 'flex items-center gap-[10px] rounded-md px-[9px] py-2 text-[12.5px] transition-colors text-neutral-400 hover:bg-neutral-800 hover:text-text'
              }
            >
              <Icon size={16} aria-hidden className="shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex items-center gap-[9px] border-t border-neutral-800 px-2 py-[9px]">
        <div className="flex min-w-0 flex-1 items-center gap-[9px]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800 text-[11px] text-neutral-300">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col leading-[1.25]">
            <span className="truncate text-[12px] text-text">{name}</span>
            <span className="text-[10.5px] text-neutral-500">Mentor</span>
          </div>
        </div>
        <UserButton appearance={{ elements: { avatarBox: 'h-6 w-6' } }} />
      </div>
    </aside>
  )
}
