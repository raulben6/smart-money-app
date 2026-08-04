import { cache } from 'react'
import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { users, type DbUser } from '@/lib/db/schema'

function isMentorEmail(email: string | undefined | null): boolean {
  const configured = process.env.MENTOR_EMAIL
  return !!configured && !!email && configured.trim().toLowerCase() === email.trim().toLowerCase()
}

export const requireUser = cache(async (): Promise<DbUser> => {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const db = getDb()
  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })

  const cu = await currentUser()
  const primaryEmail = cu?.emailAddresses[0]?.emailAddress

  if (existing) {
    if (existing.role === 'student' && isMentorEmail(primaryEmail)) {
      const [promoted] = await db.update(users).set({ role: 'mentor' }).where(eq(users.id, existing.id)).returning()
      return promoted ?? existing
    }
    return existing
  }

  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || primaryEmail || 'Estudiante'
  const role = isMentorEmail(primaryEmail) ? ('mentor' as const) : ('student' as const)
  const [created] = await db.insert(users).values({ clerkId, name, role }).onConflictDoNothing({ target: users.clerkId }).returning()
  if (created) return created
  return (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }))!
})

export const requireMentor = cache(async (): Promise<DbUser> => {
  const user = await requireUser()
  if (user.role !== 'mentor') redirect('/dashboard')
  return user
})
