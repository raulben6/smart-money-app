'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ChartLineUp, CalendarBlank, Bell, Plus, type Icon } from '@phosphor-icons/react'
import { NotificationBadge } from './NotificationBadge'
import { ThemeToggle } from './ThemeToggle'

/** Nav inferior móvil (<1024px). */
export function BottomNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav
      aria-label="Navegación principal"
      className="sidebar-scope fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
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

        <NavItem
          href="/notificaciones"
          label="Notificaciones"
          Icon={Bell}
          active={isActive('/notificaciones')}
          badgeCount={unreadCount}
        />

        <div className="flex h-full items-center gap-[10px]">
          <ThemeToggle />
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
  badgeCount,
}: {
  href: string
  label: string
  Icon: Icon
  active: boolean
  badgeCount?: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? 'text-accent' : 'text-neutral-400'}`}
    >
      <span className="relative flex">
        <Icon size={20} aria-hidden />
        {typeof badgeCount === 'number' ? (
          <NotificationBadge count={badgeCount} className="absolute -right-1.5 -top-1" />
        ) : null}
      </span>
      <span>{label}</span>
    </Link>
  )
}
