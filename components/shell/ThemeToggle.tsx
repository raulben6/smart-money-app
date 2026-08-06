'use client'

import { useSyncExternalStore } from 'react'
import { Sun, Moon } from '@phosphor-icons/react'

/**
 * Interruptor claro/oscuro. El estado real vive en `data-theme` del <html>
 * (estampado por el script inline del root layout antes del primer paint); se
 * lee con useSyncExternalStore (snapshot de servidor: oscuro) observando el
 * atributo, se alterna mutándolo y se persiste en localStorage — la elección
 * manual manda sobre la preferencia del sistema en visitas futuras.
 */

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function getTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark')

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* localStorage bloqueado: el cambio aplica solo a esta pestaña */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-text ${className}`}
    >
      {theme === 'light' ? <Moon size={15} aria-hidden /> : <Sun size={15} aria-hidden />}
    </button>
  )
}
