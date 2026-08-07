'use client'

import { useEffect, useRef } from 'react'
import { markMyNotificationsRead } from '@/lib/actions/notifications'

/**
 * Componente invisible (Task 16) montado al final de `/notificaciones`: marca como leídas
 * todas las notificaciones propias al abrir la página. El server component ya leyó
 * `readAt` ANTES de que este efecto corra (separa 'Nuevas'/'Anteriores' con los datos de
 * la respuesta ya renderizada) — este efecto se dispara en el navegador, después, así que
 * el usuario alcanza a ver cuáles eran nuevas antes de que se apaguen en la siguiente
 * visita (el badge de la barra lateral se revalida vía `revalidatePath` dentro de la
 * propia action, ver `markMyNotificationsRead`).
 *
 * `firedRef` evita un doble disparo en React StrictMode (que monta/desmonta/remonta cada
 * efecto una vez en desarrollo) — sin él, el action se llamaría dos veces por cada montaje
 * real de esta página en dev. Inofensivo por idempotencia (un segundo `UPDATE ... WHERE
 * read_at IS NULL` no encuentra filas), pero innecesario.
 */
export function MarkAsRead() {
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    void markMyNotificationsRead()
  }, [])

  return null
}
