import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { users, type DbUser } from '@/lib/db/schema'

export async function requireUser(): Promise<DbUser> {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const db = getDb()
  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })
  if (existing) return existing

  const cu = await currentUser()
  const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(' ') || cu?.emailAddresses[0]?.emailAddress || 'Estudiante'
  const [created] = await db.insert(users).values({ clerkId, name }).onConflictDoNothing({ target: users.clerkId }).returning()
  if (created) return created
  return (await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) }))!
}
