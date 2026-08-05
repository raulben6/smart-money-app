import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/lib/db/__tests__/helpers'
import { users, notifications } from '@/lib/db/schema'
import { markMyNotificationsRead } from '../notifications'
import { mockAuthAs, useTestDb } from './helpers'

// --- Mocks para las dependencias externas de lib/actions/notifications.ts --
// Mismo patrón que `trades.actions.test.ts` (Task 3).
vi.mock('@/lib/auth', async () => {
  const { authState } = await import('./helpers')
  return {
    requireUser: async () => {
      if (!authState.user) throw new Error('REDIRECT:/sign-in')
      return authState.user
    },
    requireMentor: async () => {
      if (!authState.user || authState.user.role !== 'mentor') throw new Error('REDIRECT:/dashboard')
      return authState.user
    },
    isMentorEmail: () => false,
  }
})
vi.mock('@/lib/db', async () => {
  const { dbState } = await import('./helpers')
  return { getDb: () => dbState.db }
})
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

async function seedUsers(db: TestDb) {
  const [userA] = await db.insert(users).values({ clerkId: 'clerk_a', role: 'student', name: 'Estudiante A' }).returning()
  const [userB] = await db.insert(users).values({ clerkId: 'clerk_b', role: 'student', name: 'Estudiante B' }).returning()
  return { userA, userB }
}

describe('lib/actions/notifications', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await createTestDb()
    useTestDb(db)
    mockAuthAs(null)
  })

  it('sin autenticar -> rechazo (REDIRECT:/sign-in)', async () => {
    await expect(markMyNotificationsRead()).rejects.toThrow('REDIRECT:/sign-in')
  })

  it('markMyNotificationsRead(A) marca solo las notificaciones de A; las de B quedan intactas', async () => {
    const { userA, userB } = await seedUsers(db)

    await db.insert(notifications).values({ userId: userA.id, kind: 'felicitacion', title: 'Para A', body: '...' })
    await db.insert(notifications).values({ userId: userA.id, kind: 'observacion', title: 'Para A 2', body: '...' })
    await db.insert(notifications).values({ userId: userB.id, kind: 'felicitacion', title: 'Para B', body: '...' })

    mockAuthAs(userA)
    const result = await markMyNotificationsRead()

    expect(result.ok).toBe(true)

    const deA = await db.select().from(notifications).where(eq(notifications.userId, userA.id))
    expect(deA.every((n) => n.readAt !== null)).toBe(true)

    const [deB] = await db.select().from(notifications).where(eq(notifications.userId, userB.id))
    expect(deB.readAt).toBeNull()
  })
})
