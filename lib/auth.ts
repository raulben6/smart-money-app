import { cache } from 'react'
import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { users, type DbUser } from '@/lib/db/schema'
import { findRelinkCandidateByEmail, relinkUserById, releaseEmailClaims } from '@/lib/db/queries/users'
import { isClerkNotFoundError } from '@/lib/clerk-errors'

export function isMentorEmail(email: string | undefined | null): boolean {
  const configured = process.env.MENTOR_EMAIL
  return !!configured && !!email && configured.trim().toLowerCase() === email.trim().toLowerCase()
}

/**
 * true solo si Clerk confirma con 404 que la cuenta ya no existe. Cualquier
 * otro error se propaga: un fallo de red NO es prueba de muerte, y transferir
 * una fila sin esa prueba es exactamente el robo que el hallazgo HIGH del
 * revisor describe (ver lib/db/queries/users.ts).
 */
async function clerkAccountIsDead(clerkId: string): Promise<boolean> {
  try {
    const client = await clerkClient()
    await client.users.getUser(clerkId)
    return false
  } catch (err) {
    if (isClerkNotFoundError(err)) return true
    throw err
  }
}

export const requireUser = cache(async (): Promise<DbUser> => {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const db = getDb()
  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })

  const cu = await currentUser()
  const primaryEmail = cu?.primaryEmailAddress?.emailAddress
  // Solo el correo VERIFICADO por Clerk sirve para persistir/reconectar
  // (ronda 17): un correo sin verificar no prueba propiedad.
  const verifiedEmail =
    cu?.primaryEmailAddress?.verification?.status === 'verified'
      ? primaryEmail?.trim().toLowerCase()
      : undefined

  if (existing) {
    const patch: Partial<typeof users.$inferInsert> = {}
    // Backfill/refresco del correo (filas previas a la ronda 17, o cambio de
    // correo primario en Clerk). Best-effort: nunca bloquea el login.
    if (verifiedEmail && existing.email?.toLowerCase() !== verifiedEmail) patch.email = verifiedEmail
    // Una fila archivada cuyo clerkId AÚN autentica significa que el acceso no
    // llegó a revocarse — el login válido manda y se reactiva. El guard `cu`
    // es la prueba explícita de que la cuenta Clerk sigue viva (fix LOW del
    // revisor: no depender solo del throw implícito de currentUser()).
    if (existing.archivedAt !== null && cu) patch.archivedAt = null
    if (existing.role === 'student' && isMentorEmail(primaryEmail)) patch.role = 'mentor'

    if (Object.keys(patch).length > 0) {
      try {
        // Clerk acaba de probar que este correo es del usuario ACTUAL: las
        // reclamaciones del mismo correo en otras filas son obsoletas y se
        // liberan (fix MEDIUM del revisor — sin esto, un relink futuro podría
        // entregar el historial equivocado).
        if (patch.email) await releaseEmailClaims(db, patch.email, existing.id)
        const [updated] = await db.update(users).set(patch).where(eq(users.id, existing.id)).returning()
        if (updated) return updated
      } catch (err) {
        console.error('[requireUser] patch', err)
      }
    }
    return existing
  }

  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || primaryEmail || 'Estudiante'

  // Reingreso (ronda 17): clerkId desconocido pero correo verificado que ya
  // fue de un estudiante -> se re-vincula su fila vieja (historial completo)
  // en vez de crear un duplicado — SOLO tras confirmar con Clerk que el
  // clerkId viejo de esa fila está muerto (ver clerkAccountIsDead y el doc de
  // lib/db/queries/users.ts).
  if (verifiedEmail) {
    const candidate = await findRelinkCandidateByEmail(db, verifiedEmail)
    if (candidate && (await clerkAccountIsDead(candidate.clerkId))) {
      const relinked = await relinkUserById(db, candidate.id, clerkId, name)
      if (relinked) {
        await releaseEmailClaims(db, verifiedEmail, relinked.id)
        if (relinked.role === 'student' && isMentorEmail(primaryEmail)) {
          const [promoted] = await db
            .update(users)
            .set({ role: 'mentor' })
            .where(and(eq(users.id, relinked.id), eq(users.role, 'student')))
            .returning()
          return promoted ?? relinked
        }
        return relinked
      }
    }
    // Sin candidato transferible: el correo es del usuario nuevo — cualquier
    // reclamación previa (p.ej. una fila de mentor con correo obsoleto, o un
    // candidato cuyo dueño sigue VIVO con el correo cambiado) se libera antes
    // de crear la fila.
    await releaseEmailClaims(db, verifiedEmail, null)
  }

  const role = isMentorEmail(primaryEmail) ? ('mentor' as const) : ('student' as const)
  const [created] = await db
    .insert(users)
    .values({ clerkId, name, role, email: verifiedEmail ?? null })
    .onConflictDoNothing({ target: users.clerkId })
    .returning()
  if (created) return created
  return (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }))!
})

export const requireMentor = cache(async (): Promise<DbUser> => {
  const user = await requireUser()
  if (user.role !== 'mentor') redirect('/dashboard')
  return user
})
