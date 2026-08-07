import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/lib/db/__tests__/helpers'
import { users, goals, levels, manualLevelGrants, notifications, type DbUser } from '@/lib/db/schema'
import { insertTradeWithJournal } from '@/lib/db/queries/trades'
import type { TradeFormValues } from '@/lib/validation/trade'
import type { GoalFormValues, LevelFormValues, FeedbackFormValues } from '@/lib/validation/mentor'
import {
  sendFeedback,
  createGoal,
  updateGoal,
  removeGoal,
  updateLevel,
  grantStudentLevel,
  revokeStudentLevel,
} from '../mentor'
import { mockAuthAs, useTestDb } from './helpers'

// --- Mocks para las dependencias externas de lib/actions/mentor.ts ---------
// Mismo patrón que `trades.actions.test.ts` (ver Task 3): el factory de
// `vi.mock` hace `await import('./helpers')` para leer siempre el estado
// ACTUAL de `authState`/`dbState`. `lib/actions/mentor.ts` también importa
// `clerkClient` de '@clerk/nextjs/server' a nivel de módulo, pero NINGUNA
// función testeada aquí lo invoca (inviteStudent/listPendingInvitations no se
// testean unitariamente, per el brief: llamada de red real) — no hace falta
// mockear ese paquete; importarlo en Node no dispara ningún efecto colateral
// hasta que `clerkClient()` se invoca de verdad.
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

// Texto real de la constante SIN_PERMISO en lib/actions/mentor.ts (no un
// mensaje inventado): si el módulo cambia el texto, este test debe fallar.
const SIN_PERMISO = 'No se encontró el recurso o no tienes permiso para esta acción'

const minimalGoal: GoalFormValues = {
  kind: 'ganancia',
  name: 'Meta de ganancia',
  description: '',
  targetValue: 1000,
  thresholdValue: null,
  manualProgress: null,
  startDate: '2026-08-01',
  dueDate: '2026-08-31',
}

const minimalLevelValues: LevelFormValues = {
  name: 'Nivel actualizado',
  goalAmount: 5000,
  minProfitFactor: null,
  minTrades: null,
  maxDrawdownPct: null,
}

const minimalFeedback: FeedbackFormValues = {
  kind: 'felicitacion',
  title: 'Buen trabajo',
  body: 'Sigue así',
  tradeId: null,
}

const minimalTrade: TradeFormValues = {
  tradeDate: '2026-08-01',
  asset: 'AAPL',
  market: 'acciones',
  direction: 'long',
  entryTime: null,
  exitTime: null,
  entryPrice: null,
  exitPrice: null,
  contracts: null,
  positionSize: null,
  stopLoss: null,
  takeProfit: null,
  riskUsd: null,
  riskPct: null,
  pnlUsd: 100,
  rMultiple: null,
  setup: '',
  timeframe: '',
  marketConditions: null,
  entryType: null,
  confirmations: null,
}

async function seedMentorAndStudent(db: TestDb) {
  const [mentor] = await db.insert(users).values({ clerkId: 'clerk_mentor', role: 'mentor', name: 'Mentor M' }).returning()
  const [studentA] = await db.insert(users).values({ clerkId: 'clerk_a', role: 'student', name: 'Estudiante A' }).returning()
  const [studentB] = await db.insert(users).values({ clerkId: 'clerk_b', role: 'student', name: 'Estudiante B' }).returning()
  return { mentor, studentA, studentB }
}

// La migración 0001 siembra 5 niveles (positions 1-5); se leen los ya
// existentes en vez de insertar niveles propios (mismo patrón que
// lib/db/queries/__tests__/mentor.test.ts).
async function getLevelByPosition(db: TestDb, position: number) {
  const [row] = await db.select().from(levels).where(eq(levels.position, position))
  if (!row) throw new Error(`No existe un nivel sembrado con position=${position}`)
  return row
}

describe('lib/actions/mentor', () => {
  let db: TestDb
  let mentor: DbUser, studentA: DbUser, studentB: DbUser

  beforeEach(async () => {
    db = await createTestDb()
    useTestDb(db)
    mockAuthAs(null)
    ;({ mentor, studentA, studentB } = await seedMentorAndStudent(db))
  })

  describe('gate de requireMentor (un estudiante nunca ejecuta estas actions)', () => {
    it('sendFeedback llamado por un estudiante -> rechazo (REDIRECT:/dashboard)', async () => {
      mockAuthAs({ ...studentA, role: 'student' })
      await expect(sendFeedback(studentA.id, minimalFeedback)).rejects.toThrow('REDIRECT:/dashboard')
    })

    it('createGoal llamado por un estudiante -> rechazo (REDIRECT:/dashboard)', async () => {
      mockAuthAs({ ...studentA, role: 'student' })
      await expect(createGoal(studentA.id, minimalGoal)).rejects.toThrow('REDIRECT:/dashboard')
    })

    it('updateLevel llamado por un estudiante -> rechazo (REDIRECT:/dashboard)', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      mockAuthAs({ ...studentA, role: 'student' })
      await expect(updateLevel(nivel1.id, minimalLevelValues)).rejects.toThrow('REDIRECT:/dashboard')
    })
  })

  describe('createGoal', () => {
    it('mentor con payload inválido -> ok:false con fieldErrors', async () => {
      mockAuthAs(mentor)

      const result = await createGoal(studentA.id, { ...minimalGoal, name: '' })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.fieldErrors).toBeDefined()
      expect(result.fieldErrors?.name).toBeDefined()
    })

    it('mentor con payload válido -> ok:true y el objetivo queda en la DB de A', async () => {
      mockAuthAs(mentor)

      const result = await createGoal(studentA.id, minimalGoal)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')

      const [row] = await db.select().from(goals).where(eq(goals.id, result.data.id))
      expect(row).toBeDefined()
      expect(row.userId).toBe(studentA.id)
      expect(row.name).toBe('Meta de ganancia')
    })

    it('studentId con forma no-uuid -> ok:false SIN_PERMISO (nunca llega a la query)', async () => {
      mockAuthAs(mentor)

      const result = await createGoal('no-es-un-uuid', minimalGoal)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toBe(SIN_PERMISO)
    })
  })

  describe('updateGoal / removeGoal', () => {
    it('updateGoal válido -> ok:true y refleja los cambios', async () => {
      mockAuthAs(mentor)
      const created = await createGoal(studentA.id, minimalGoal)
      if (!created.ok) throw new Error('seed de goal falló')

      const result = await updateGoal(created.data.id, { ...minimalGoal, name: 'Meta ajustada', targetValue: 2000 })

      expect(result.ok).toBe(true)
      const [row] = await db.select().from(goals).where(eq(goals.id, created.data.id))
      expect(row.name).toBe('Meta ajustada')
      expect(row.targetValue).toBe(2000)
    })

    it('removeGoal válido -> ok:true y el objetivo desaparece', async () => {
      mockAuthAs(mentor)
      const created = await createGoal(studentA.id, minimalGoal)
      if (!created.ok) throw new Error('seed de goal falló')

      const result = await removeGoal(created.data.id)

      expect(result.ok).toBe(true)
      const rows = await db.select().from(goals).where(eq(goals.id, created.data.id))
      expect(rows).toEqual([])
    })
  })

  describe('sendFeedback', () => {
    it('mentor con payload inválido -> ok:false con fieldErrors', async () => {
      mockAuthAs(mentor)

      const result = await sendFeedback(studentA.id, { ...minimalFeedback, title: '' })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.fieldErrors?.title).toBeDefined()
    })

    it('mentor con payload válido -> ok:true y la notificación queda en la DB de A', async () => {
      mockAuthAs(mentor)

      const result = await sendFeedback(studentA.id, minimalFeedback)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')

      const [row] = await db.select().from(notifications).where(eq(notifications.id, result.data.id))
      expect(row).toBeDefined()
      expect(row.userId).toBe(studentA.id)
      expect(row.title).toBe('Buen trabajo')
      expect(row.kind).toBe('felicitacion')
      expect(row.readAt).toBeNull()
    })

    it('tradeId de un trade que SÍ pertenece al estudiante destinatario -> ok:true', async () => {
      mockAuthAs(mentor)
      const tradeIdDeA = await insertTradeWithJournal(db, studentA.id, minimalTrade)

      const result = await sendFeedback(studentA.id, { ...minimalFeedback, tradeId: tradeIdDeA })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      const [row] = await db.select().from(notifications).where(eq(notifications.id, result.data.id))
      expect(row.tradeId).toBe(tradeIdDeA)
    })

    // SEGURIDAD (hallazgo del revisor de Task 9, controller-asignado a esta Task 16):
    // `insertNotification` por sí sola no verifica que `tradeId` pertenezca al estudiante
    // destinatario — solo que el trade exista. Este test cubre justo el caso que ese gate
    // por sí solo no detectaría: un tradeId real, pero de OTRO estudiante.
    it('tradeId de un trade de OTRO estudiante (studentB) al enviar feedback a studentA -> ok:false SIN_PERMISO, sin crear la notificación', async () => {
      mockAuthAs(mentor)
      const tradeIdDeB = await insertTradeWithJournal(db, studentB.id, minimalTrade)

      const result = await sendFeedback(studentA.id, { ...minimalFeedback, tradeId: tradeIdDeB })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toBe(SIN_PERMISO)

      const rows = await db.select().from(notifications).where(eq(notifications.userId, studentA.id))
      expect(rows).toEqual([])
    })
  })

  describe('updateLevel', () => {
    it('mentor con payload válido -> ok:true y el nivel queda actualizado', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      mockAuthAs(mentor)

      const result = await updateLevel(nivel1.id, minimalLevelValues)

      expect(result.ok).toBe(true)
      const [row] = await db.select().from(levels).where(eq(levels.id, nivel1.id))
      expect(row.name).toBe('Nivel actualizado')
      expect(row.goalAmount).toBe(5000)
    })

    it('levelId con forma no-uuid -> ok:false SIN_PERMISO', async () => {
      mockAuthAs(mentor)

      const result = await updateLevel('no-es-un-uuid', minimalLevelValues)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toBe(SIN_PERMISO)
    })
  })

  describe('grantStudentLevel / revokeStudentLevel', () => {
    it('grantStudentLevel con studentId no-uuid -> ok:false SIN_PERMISO', async () => {
      const nivel5 = await getLevelByPosition(db, 5)
      mockAuthAs(mentor)

      const result = await grantStudentLevel('no-es-un-uuid', nivel5.id)

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toBe(SIN_PERMISO)
    })

    it('grantStudentLevel con levelId no-uuid -> ok:false SIN_PERMISO', async () => {
      mockAuthAs(mentor)

      const result = await grantStudentLevel(studentA.id, 'no-es-un-uuid')

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('unreachable')
      expect(result.error).toBe(SIN_PERMISO)
    })

    it('grantStudentLevel válido -> ok:true y aparece en manual_level_grants; revokeStudentLevel lo quita', async () => {
      const nivel5 = await getLevelByPosition(db, 5)
      mockAuthAs(mentor)

      const granted = await grantStudentLevel(studentA.id, nivel5.id)
      expect(granted.ok).toBe(true)

      const [grantRow] = await db
        .select()
        .from(manualLevelGrants)
        .where(eq(manualLevelGrants.userId, studentA.id))
      expect(grantRow).toBeDefined()
      expect(grantRow.levelId).toBe(nivel5.id)

      const revoked = await revokeStudentLevel(studentA.id, nivel5.id)
      expect(revoked.ok).toBe(true)

      const rowsAfter = await db.select().from(manualLevelGrants).where(eq(manualLevelGrants.userId, studentA.id))
      expect(rowsAfter).toEqual([])
    })
  })
})
