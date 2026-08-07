import { clerkClient } from '@clerk/nextjs/server'

export type InvitationListItem = { email: string; status: string; createdAt: number }

// Los únicos 3 estados que la pantalla de invitaciones (Task 17) sabe pintar como tag
// (Pendiente/Aceptada/Revocada) — 'expired' queda fuera a propósito: el mockup/brief no le
// asigna una tag y esas invitaciones no son accionables desde aquí.
const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const

/**
 * Lee las invitaciones de la instancia de Clerk para pintar la tabla server-side de
 * `/invitaciones` (Task 17). Un Server Action (como `listPendingInvitations` de
 * `lib/actions/mentor.ts`, Task 10) solo puede invocarse desde un evento del cliente, NUNCA
 * durante el render de un Server Component — así que la lectura que alimenta esta página
 * pasa por este helper propio, que llama a `clerkClient()` directamente. `listPendingInvitations`
 * sigue existiendo para un futuro refresco disparado desde el cliente (p. ej. un botón
 * "Actualizar"), pero la página NO la usa al renderizar.
 *
 * `client.invitations.getInvitationList()` de Clerk solo acepta UN `status` a la vez (a
 * diferencia de la versión de Organizations, que acepta un array) y, sin filtro, devuelve
 * solo las invitaciones NO revocadas — así que se piden los 3 estados que esta pantalla
 * necesita en paralelo y se combinan, en vez de una sola llamada sin filtro que dejaría
 * fuera las revocadas.
 *
 * Nunca lanza: cualquier error de red/Clerk se registra con `console.error` y se
 * devuelve `[]`, para que la página siempre pueda renderizar (aunque sea con la lista vacía)
 * en vez de tumbar todo `/invitaciones` por un fallo transitorio de la API de Clerk.
 */
export async function getInvitationList(): Promise<InvitationListItem[]> {
  try {
    const client = await clerkClient()
    const lists = await Promise.all(
      INVITATION_STATUSES.map((status) => client.invitations.getInvitationList({ status, limit: 100 })),
    )
    return lists
      .flatMap((list) => list.data)
      .map((invitation) => ({
        email: invitation.emailAddress,
        status: invitation.status,
        createdAt: invitation.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch (err) {
    console.error('[getInvitationList]', err)
    return []
  }
}
