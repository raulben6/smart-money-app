'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refresco automático de datos sin recargar la página: reejecuta los Server
 * Components de la ruta (`router.refresh()`) cada `intervalMs` mientras la
 * pestaña está visible, y de inmediato al volver a ella o al recuperar
 * conexión. Así el feedback del mentor, el badge de no leídas, el panel, etc.
 * aparecen solos (pedido del usuario, ronda 11 del smoke).
 *
 * `router.refresh()` NO toca el estado de los componentes cliente: lo que el
 * usuario esté escribiendo (bitácora, formularios) se conserva. El guard de
 * `MIN_GAP_MS` evita ráfagas cuando focus y visibilitychange disparan juntos.
 */
const MIN_GAP_MS = 5_000

export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter()
  const lastRefresh = useRef(0)

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      // Con un modal abierto (registro de trade, objetivos...) no se refresca:
      // un re-render a mitad de escritura puede producir tirones, sobre todo
      // en móvil con el teclado desplegado. Al cerrar, el siguiente tick trae
      // los datos frescos.
      if (document.querySelector('[role="dialog"]')) return
      const now = Date.now()
      if (now - lastRefresh.current < MIN_GAP_MS) return
      lastRefresh.current = now
      router.refresh()
    }

    const interval = setInterval(refresh, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [router, intervalMs])

  return null
}
