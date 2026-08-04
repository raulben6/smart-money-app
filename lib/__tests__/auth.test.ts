import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../db/__tests__/helpers'
import { users } from '../db/schema'
import { isMentorEmail, requireUser, requireMentor } from '../auth'

// --- Mocks para las dependencias externas de lib/auth.ts -------------------
// Nota: vi.mock() se "hoistea" por Vitest al inicio del módulo, así que estas
// llamadas se aplican antes de que se resuelva el import de '../auth' de
// arriba (que a su vez importa '@clerk/nextjs/server', 'next/navigation' y
// '@/lib/db'). Los `*Mock` sólo se LEEN dentro de los closures devueltos por
// cada factory (nunca al construir el objeto de la factory), así que no hay
// problema de TDZ aunque la factory se invoque antes de que la línea
// `const xMock = vi.fn()` se ejecute.

const authMock = vi.fn()
const currentUserMock = vi.fn()
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`)
})

let testDb: TestDb

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
}))

const MENTOR = 'kb2813085@gmail.com'

function mockClerkUser(opts: {
  primaryEmail?: string
  otherEmails?: string[]
  firstName?: string | null
  lastName?: string | null
}) {
  const primary = opts.primaryEmail ? { emailAddress: opts.primaryEmail } : null
  const emailAddresses = [...(opts.otherEmails ?? []).map((e) => ({ emailAddress: e })), ...(primary ? [primary] : [])]
  return {
    firstName: opts.firstName ?? null,
    lastName: opts.lastName ?? null,
    emailAddresses,
    primaryEmailAddress: primary,
  }
}

let savedMentorEmail: string | undefined

beforeEach(async () => {
  savedMentorEmail = process.env.MENTOR_EMAIL
  testDb = await createTestDb()
  authMock.mockReset()
  currentUserMock.mockReset()
  redirectMock.mockClear()
})

afterEach(() => {
  if (savedMentorEmail === undefined) delete process.env.MENTOR_EMAIL
  else process.env.MENTOR_EMAIL = savedMentorEmail
})

describe('isMentorEmail', () => {
  it('env sin definir -> false', () => {
    delete process.env.MENTOR_EMAIL
    expect(isMentorEmail('cualquiera@ejemplo.com')).toBe(false)
  })

  it('env vacío ("") -> false', () => {
    process.env.MENTOR_EMAIL = ''
    expect(isMentorEmail('cualquiera@ejemplo.com')).toBe(false)
  })

  it('email undefined -> false', () => {
    process.env.MENTOR_EMAIL = MENTOR
    expect(isMentorEmail(undefined)).toBe(false)
  })

  it('coincidencia exacta -> true', () => {
    process.env.MENTOR_EMAIL = MENTOR
    expect(isMentorEmail(MENTOR)).toBe(true)
  })

  it('coincidencia insensible a mayúsculas/espacios -> true', () => {
    process.env.MENTOR_EMAIL = MENTOR
    expect(isMentorEmail('  KB2813085@Gmail.com ')).toBe(true)
  })

  it('email distinto -> false', () => {
    process.env.MENTOR_EMAIL = MENTOR
    expect(isMentorEmail('otra@ejemplo.com')).toBe(false)
  })
})

describe('requireUser: promoción por MENTOR_EMAIL (usa primaryEmailAddress, no emailAddresses[0])', () => {
  it('estudiante existente con primaryEmailAddress que coincide -> se promueve a mentor', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    const [seeded] = await testDb.insert(users).values({ clerkId: 'clerk_x', name: 'Karla', role: 'student' }).returning()
    authMock.mockResolvedValue({ userId: 'clerk_x' })
    currentUserMock.mockResolvedValue(mockClerkUser({ primaryEmail: MENTOR, firstName: 'Karla' }))

    const result = await requireUser()

    expect(result.role).toBe('mentor')
    expect(result.id).toBe(seeded.id)

    const [persisted] = await testDb.select().from(users).where(eq(users.id, seeded.id))
    expect(persisted.role).toBe('mentor')
  })

  it('estudiante existente con email NO-primario coincidente en emailAddresses[0] pero primaryEmailAddress distinto -> NO se promueve (regresión del finding 1)', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    const [seeded] = await testDb.insert(users).values({ clerkId: 'clerk_x', name: 'Karla', role: 'student' }).returning()
    authMock.mockResolvedValue({ userId: 'clerk_x' })
    // emailAddresses[0] sería MENTOR si el código (incorrectamente) usara ese índice,
    // pero primaryEmailAddress es un correo secundario distinto.
    currentUserMock.mockResolvedValue(
      mockClerkUser({ otherEmails: [MENTOR], primaryEmail: 'secundario@ejemplo.com', firstName: 'Karla' }),
    )

    const result = await requireUser()

    expect(result.role).toBe('student')

    const [persisted] = await testDb.select().from(users).where(eq(users.id, seeded.id))
    expect(persisted.role).toBe('student')
  })

  it('usuario nuevo con primaryEmailAddress que coincide -> nace como mentor', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    authMock.mockResolvedValue({ userId: 'clerk_new' })
    currentUserMock.mockResolvedValue(mockClerkUser({ primaryEmail: MENTOR, firstName: 'Nueva', lastName: 'Mentora' }))

    const result = await requireUser()

    expect(result.role).toBe('mentor')
    expect(result.clerkId).toBe('clerk_new')

    const [persisted] = await testDb.select().from(users).where(eq(users.clerkId, 'clerk_new'))
    expect(persisted.role).toBe('mentor')
  })

  it('usuario nuevo sin coincidencia -> nace como student (default)', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    authMock.mockResolvedValue({ userId: 'clerk_new2' })
    currentUserMock.mockResolvedValue(mockClerkUser({ primaryEmail: 'otra@ejemplo.com', firstName: 'Otro' }))

    const result = await requireUser()

    expect(result.role).toBe('student')
  })
})

describe('requireMentor', () => {
  it('con role student -> lanza el redirect mock hacia /dashboard', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    await testDb.insert(users).values({ clerkId: 'clerk_student', name: 'Estudiante', role: 'student' }).returning()
    authMock.mockResolvedValue({ userId: 'clerk_student' })
    currentUserMock.mockResolvedValue(mockClerkUser({ primaryEmail: 'otra@ejemplo.com', firstName: 'Estudiante' }))

    await expect(requireMentor()).rejects.toThrow('REDIRECT:/dashboard')
    expect(redirectMock).toHaveBeenCalledWith('/dashboard')
  })

  it('con role mentor -> devuelve el usuario sin redirigir', async () => {
    process.env.MENTOR_EMAIL = MENTOR
    const [seeded] = await testDb.insert(users).values({ clerkId: 'clerk_mentor', name: 'Mentor', role: 'mentor' }).returning()
    authMock.mockResolvedValue({ userId: 'clerk_mentor' })
    currentUserMock.mockResolvedValue(mockClerkUser({ primaryEmail: 'otra@ejemplo.com', firstName: 'Mentor' }))

    const result = await requireMentor()

    expect(result.id).toBe(seeded.id)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
