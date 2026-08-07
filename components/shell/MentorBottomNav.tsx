'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { SquaresFour, ArrowsLeftRight, EnvelopeSimple, type Icon } from '@phosphor-icons/react'
import { ThemeToggle } from './ThemeToggle'

/** Nav inferior móvil del mentor (<1024px). Simplificación: 4 slots — el resto de la nav se alcanza desde Panel. */
export function MentorBottomNav() {
  const pathname = usePathname()
  const isActive = (href: string, matchPrefixes: string[] = []) =>
    pathname === href || pathname.startsWith(`${href}/`) || matchPrefixes.some((p) => pathname.startsWith(p))

  return (
    <nav
      aria-label="Navegación principal"
      className="sidebar-scope fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex h-14 items-center justify-around">
        <NavItem href="/panel" label="Panel" Icon={SquaresFour} active={isActive('/panel', ['/estudiantes/'])} />
        <NavItem href="/comparador" label="Comparador" Icon={ArrowsLeftRight} active={isActive('/comparador')} />
        <NavItem href="/mensajes" label="Mensajes" Icon={EnvelopeSimple} active={isActive('/mensajes')} />

        <div className="flex h-full items-center gap-[10px]">
          <ThemeToggle />
          <UserButton appearance={{ elements: { avatarBox: 'h-7 w-7' } }} />
        </div>
      </div>
    </nav>
  )
}

function NavItem({ href, label, Icon, active }: { href: string; label: string; Icon: Icon; active: boolean }) {
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
