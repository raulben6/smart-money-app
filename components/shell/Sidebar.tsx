'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ChartLineUp, CalendarBlank } from '@phosphor-icons/react'
import { Brand } from './Brand'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', Icon: ChartLineUp },
  { href: '/calendario', label: 'Calendario', Icon: CalendarBlank },
] as const

/** Sidebar de escritorio (≥1024px). Ver mockup líneas 27-64. */
export function Sidebar({ name, initials }: { name: string; initials: string }) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-[22px] border-r border-neutral-800 px-[14px] py-[20px] lg:flex">
      <Brand />

      <nav aria-label="Navegación principal" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
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
            <span className="text-[10.5px] text-neutral-500">Nivel —</span>
          </div>
        </div>
        <UserButton appearance={{ elements: { avatarBox: 'h-6 w-6' } }} />
      </div>
    </aside>
  )
}
