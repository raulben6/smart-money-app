'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ChartLineUp, CalendarBlank, Plus, type Icon } from '@phosphor-icons/react'

/** Nav inferior móvil (<1024px). */
export function BottomNav() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-14 items-center justify-around">
        <NavItem href="/dashboard" label="Dashboard" Icon={ChartLineUp} active={isActive('/dashboard')} />

        <Link
          href="/calendario?nuevo=1"
          aria-label="Registrar trade"
          className="btn btn-primary btn-icon"
          style={{ borderRadius: '9999px' }}
        >
          <Plus size={18} aria-hidden />
        </Link>

        <NavItem href="/calendario" label="Calendario" Icon={CalendarBlank} active={isActive('/calendario')} />

        <div className="flex h-full items-center">
          <UserButton appearance={{ elements: { avatarBox: 'h-7 w-7' } }} />
        </div>
      </div>
    </nav>
  )
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: Icon
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? 'text-accent' : 'text-neutral-400'}`}
    >
      <Icon size={20} aria-hidden />
      <span>{label}</span>
    </Link>
  )
}
