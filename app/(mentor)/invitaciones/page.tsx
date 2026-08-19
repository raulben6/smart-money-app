import type { CSSProperties } from 'react'
import { requireMentor } from '@/lib/auth'
import { getInvitationList, type InvitationListItem } from '@/lib/clerk-invitations'
import { relativeTime } from '@/lib/format'
import { PageHeader } from '@/components/shell/PageHeader'
import { InviteForm } from '@/components/mentor/InviteForm'

/** Tag (clase + label) para el estado de una invitación de Clerk — ver mapeo del brief F2-T17. */
function statusTag(status: InvitationListItem['status']): { label: string; className: string; style?: CSSProperties } {
  switch (status) {
    case 'accepted':
      return {
        label: 'Aceptada',
        className: 'tag',
        style: { color: 'var(--pos)', border: '1px solid color-mix(in oklab, var(--pos) 45%, transparent)', background: 'transparent' },
      }
    case 'revoked':
      return { label: 'Revocada', className: 'tag tag-neutral' }
    case 'pending':
    default:
      return { label: 'Pendiente', className: 'tag tag-outline' }
  }
}

/**
 * `/invitaciones` (Task 17, mockup de invitaciones desde la app): tarjeta con `InviteForm`
 * (client, envía la invitación) + tabla de invitaciones de la instancia de Clerk, cargada
 * SERVER-SIDE con `getInvitationList` (`lib/clerk-invitations.ts`) — NO con la Server Action
 * `listPendingInvitations` de `lib/actions/mentor.ts` (Task 10): un Server Action solo puede
 * invocarse desde un evento del cliente, nunca durante el render de un Server Component. Esa
 * action sigue existiendo (para un futuro refresco disparado desde el cliente), pero esta
 * página no la llama; ver doc de `getInvitationList` para el detalle completo del split.
 *
 * `now` se calcula una sola vez por render y se pasa a `relativeTime` para cada fila (misma
 * firma pura que usa el centro de notificaciones).
 */
export default async function InvitacionesPage() {
  await requireMentor()
  const invitations = await getInvitationList()
  const now = new Date()

  return (
    <>
      <PageHeader title="Invitaciones" subtitle="Invita a tus estudiantes por correo — recibirán un enlace para registrarse" />

      <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]">
        <InviteForm />

        <div className="card" style={{ padding: '18px 20px', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '14px' }}>Invitaciones enviadas</h2>

          {invitations.length === 0 ? (
            <p className="m-0 text-[13px] text-neutral-400">Aún no has enviado invitaciones</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[420px]" style={{ width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th scope="col" className="text-left">
                      Correo
                    </th>
                    <th scope="col" className="text-left">
                      Estado
                    </th>
                    <th scope="col" className="text-left">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => {
                    const tag = statusTag(invitation.status)
                    return (
                      <tr key={`${invitation.email}-${invitation.createdAt}`}>
                        <td>{invitation.email}</td>
                        <td>
                          <span className={tag.className} style={{ fontSize: '10px', ...tag.style }}>
                            {tag.label}
                          </span>
                        </td>
                        <td className="text-neutral-400">{relativeTime(new Date(invitation.createdAt), now)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
