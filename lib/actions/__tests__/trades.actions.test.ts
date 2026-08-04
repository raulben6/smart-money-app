import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/lib/db/__tests__/helpers'
import { users, trades } from '@/lib/db/schema'
import type { TradeFormValues } from '@/lib/validation/trade'
import { createTrade, updateTrade, removeTrade } from '../trades'
import { mockAuthAs, useTestDb } from './helpers'

// --- Mocks para las dependencias externas de lib/actions/trades.ts ---------
// `vi.mock` es hoisted por Vitest al inicio del módulo (antes que los imports
// de arriba se resuelvan), así que el factory no puede cerrar sobre variables
// del propio archivo de test. En vez de eso, el factory hace `await
// import('./helpers')` para leer siempre el estado ACTUAL de `authState` /
// `dbState` (mutado por `mockAuthAs`/`useTestDb` en cada test), evitando
// problemas de TDZ o de "snapshot" de un valor viejo.
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

const validTrade: TradeFormValues = {
  tradeDate: '2026-08-10',
  asset: 'SPY',
  market: 'indices',
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
  pnlUsd: 420,
  rMultiple: null,
  setup: 'Ruptura de apertura',
  timeframe: '5m',
  marketConditions: null,
  entryType: null,
  confirmations: null,
}

async function seedUsers(db: TestDb) {
  const [userA] = await db.insert(users).values({ clerkId: 'clerk_a', name: 'Usuario A' }).returning()
  const [userB] = await db.insert(users).values({ clerkId: 'clerk_b', name: 'Usuario B' }).returning()
  return { userA, userB }
}

// Texto real de la constante SIN_PERMISO en lib/actions/trades.ts (no un
// mensaje inventado): si el módulo cambia el texto, este test debe fallar.
const SIN_PERMISO = 'No se encontró la operación o no tienes permiso para modificarla'

describe('lib/actions/trades', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await createTestDb()
    useTestDb(db)
    mockAuthAs(null)
  })

  it('(a) createTrade válido con A -> ok:true y la fila queda en la DB', async () => {
    const { userA } = await seedUsers(db)
    mockAuthAs(userA)

    const result = await createTrade(validTrade)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(typeof result.data.id).toBe('string')

    const [row] = await db.select().from(trades).where(eq(trades.id, result.data.id))
    expect(row).toBeDefined()
    expect(row.asset).toBe('SPY')
    expect(row.userId).toBe(userA.id)
  })

  it('(b) createTrade con payload inválido -> ok:false con fieldErrors', async () => {
    const { userA } = await seedUsers(db)
    mockAuthAs(userA)

    const result = await createTrade({ ...validTrade, asset: '' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.fieldErrors).toBeDefined()
    expect(result.fieldErrors?.asset).toBeDefined()
  })

  it('(c) updateTrade con tradeId no-uuid -> ok:false y el mensaje de SIN_PERMISO', async () => {
    const { userA } = await seedUsers(db)
    mockAuthAs(userA)

    const result = await updateTrade('no-es-un-uuid', validTrade)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe(SIN_PERMISO)
  })

  it('(d) updateTrade de A sobre un trade de B -> ok:false y la fila de B queda intacta', async () => {
    const { userA, userB } = await seedUsers(db)
    mockAuthAs(userB)
    const created = await createTrade(validTrade)
    if (!created.ok) throw new Error('seed de trade de B falló')
    const tradeId = created.data.id

    mockAuthAs(userA)
    const result = await updateTrade(tradeId, { ...validTrade, asset: 'HACKED' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe(SIN_PERMISO)

    const [row] = await db.select().from(trades).where(eq(trades.id, tradeId))
    expect(row.asset).toBe('SPY')
    expect(row.userId).toBe(userB.id)
  })

  it('(e) removeTrade con tradeId no-uuid -> ok:false', async () => {
    const { userA } = await seedUsers(db)
    mockAuthAs(userA)

    const result = await removeTrade('no-es-un-uuid')

    expect(result.ok).toBe(false)
  })
})
