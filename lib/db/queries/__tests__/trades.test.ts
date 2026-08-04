import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../__tests__/helpers'
import { users, trades, tradeJournals } from '../../schema'
import {
  listTrades,
  getTradeDetail,
  insertTradeWithJournal,
  updateTradeById,
  upsertJournal,
  deleteTradeById,
} from '../trades'
import type { TradeFormValues, JournalFormValues } from '@/lib/validation/trade'

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
  pnlUsd: 420.5,
  rMultiple: null,
  setup: '',
  timeframe: '',
  marketConditions: null,
  entryType: null,
  confirmations: null,
}

const minimalJournal: JournalFormValues = {
  whyTook: 'Ruptura de rango',
  whatSaw: 'Volumen creciente',
  followedPlan: 'Sí',
  didWell: 'Entrada a tiempo',
  didWrong: 'Salida tardía',
  improve: 'Ajustar stop',
  emotions: { antes: ['Calma'], durante: ['Enfoque'], despues: ['Confianza'] },
}

async function seedUsers(db: TestDb) {
  const [userA] = await db.insert(users).values({ clerkId: 'clerk_a', name: 'Usuario A' }).returning()
  const [userB] = await db.insert(users).values({ clerkId: 'clerk_b', name: 'Usuario B' }).returning()
  return { userA, userB }
}

describe('lib/db/queries/trades', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await createTestDb()
  })

  it('(a) insertTradeWithJournal crea trade+journal y listTrades(db, A) lo devuelve', async () => {
    const { userA } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)
    expect(typeof tradeId).toBe('string')

    const listado = await listTrades(db, userA.id)
    expect(listado).toHaveLength(1)
    expect(listado[0].id).toBe(tradeId)
    expect(listado[0].asset).toBe('AAPL')

    const [journal] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(journal).toBeDefined()
    expect(journal.whyTook).toBe('Ruptura de rango')
    expect(journal.emotions).toEqual({ antes: ['Calma'], durante: ['Enfoque'], despues: ['Confianza'] })
  })

  it('insertTradeWithJournal sin journal crea uno con defaults vacíos (siempre existe fila de journal)', async () => {
    const { userA } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade)

    const [journal] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(journal).toBeDefined()
    expect(journal.whyTook).toBe('')
    expect(journal.whatSaw).toBe('')
    expect(journal.followedPlan).toBe('')
    expect(journal.didWell).toBe('')
    expect(journal.didWrong).toBe('')
    expect(journal.improve).toBe('')
    expect(journal.emotions).toEqual({ antes: [], durante: [], despues: [] })
  })

  it('(b) listTrades(db, B) NO devuelve trades de A', async () => {
    const { userA, userB } = await seedUsers(db)
    await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)

    const listadoB = await listTrades(db, userB.id)
    expect(listadoB).toHaveLength(0)
  })

  it('listTrades ordena por tradeDate desc y luego createdAt desc', async () => {
    const { userA } = await seedUsers(db)
    await insertTradeWithJournal(db, userA.id, { ...minimalTrade, tradeDate: '2026-07-01', asset: 'OLD' })
    await insertTradeWithJournal(db, userA.id, { ...minimalTrade, tradeDate: '2026-08-01', asset: 'NEW' })

    const listado = await listTrades(db, userA.id)
    expect(listado.map((t) => t.asset)).toEqual(['NEW', 'OLD'])
  })

  it('(c) getTradeDetail(db, B, tradeDeA) -> null', async () => {
    const { userA, userB } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)

    const detalleB = await getTradeDetail(db, userB.id, tradeId)
    expect(detalleB).toBeNull()

    const detalleA = await getTradeDetail(db, userA.id, tradeId)
    expect(detalleA).not.toBeNull()
    expect(detalleA?.trade.id).toBe(tradeId)
    expect(detalleA?.journal).not.toBeNull()
    expect(detalleA?.captures).toEqual([])
  })

  it('(d) updateTradeById(db, B, tradeDeA, ...) -> false y el trade queda intacto', async () => {
    const { userA, userB } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)

    const ok = await updateTradeById(db, userB.id, tradeId, { ...minimalTrade, asset: 'HACKED' })
    expect(ok).toBe(false)

    const [tradeSinCambios] = await db.select().from(trades).where(eq(trades.id, tradeId))
    expect(tradeSinCambios.asset).toBe('AAPL')
  })

  it('updateTradeById(db, A, tradeDeA, ...) -> true y actualiza los campos', async () => {
    const { userA } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)

    const ok = await updateTradeById(db, userA.id, tradeId, { ...minimalTrade, asset: 'MSFT', pnlUsd: 100 })
    expect(ok).toBe(true)

    const [actualizado] = await db.select().from(trades).where(eq(trades.id, tradeId))
    expect(actualizado.asset).toBe('MSFT')
    expect(actualizado.pnlUsd).toBe(100)
  })

  it('(e) deleteTradeById(db, B, tradeDeA) -> false; con A -> true y desaparece con su journal (cascade)', async () => {
    const { userA, userB } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)

    const okB = await deleteTradeById(db, userB.id, tradeId)
    expect(okB).toBe(false)

    const [tradeIntacto] = await db.select().from(trades).where(eq(trades.id, tradeId))
    expect(tradeIntacto).toBeDefined()

    const okA = await deleteTradeById(db, userA.id, tradeId)
    expect(okA).toBe(true)

    const [tradeBorrado] = await db.select().from(trades).where(eq(trades.id, tradeId))
    expect(tradeBorrado).toBeUndefined()

    const [journalBorrado] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(journalBorrado).toBeUndefined()
  })

  it('(f) upsertJournal crea el journal si no existe y lo actualiza si ya existe', async () => {
    const { userA } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade)

    const created = await upsertJournal(db, userA.id, tradeId, minimalJournal)
    expect(created).toBe(true)
    const [journal1] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(journal1.whyTook).toBe('Ruptura de rango')

    const updated = await upsertJournal(db, userA.id, tradeId, { ...minimalJournal, whyTook: 'Cambié de opinión' })
    expect(updated).toBe(true)
    const [journal2] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(journal2.whyTook).toBe('Cambié de opinión')
    // sigue siendo un único registro (upsert, no insert duplicado)
    const todos = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
    expect(todos).toHaveLength(1)
  })

  it('upsertJournal(db, B, tradeDeA, ...) -> false (no autorizado)', async () => {
    const { userA, userB } = await seedUsers(db)
    const tradeId = await insertTradeWithJournal(db, userA.id, minimalTrade)

    const ok = await upsertJournal(db, userB.id, tradeId, minimalJournal)
    expect(ok).toBe(false)
  })

  it('insertTradeWithJournal: si falla el insert del journal, borra el trade insertado y relanza', async () => {
    const { userA } = await seedUsers(db)
    // Parcheamos db.insert para forzar un fallo determinista en la segunda llamada
    // (la del journal, dentro de insertTradeWithJournal) sin depender de violar
    // constraints reales de Postgres.
    const originalInsert = db.insert.bind(db)
    let call = 0
    db.insert = (table: unknown) => {
      call += 1
      if (call === 2) {
        // segunda llamada a insert() dentro de insertTradeWithJournal es la del journal
        throw new Error('fallo simulado al insertar journal')
      }
      return originalInsert(table as never)
    }

    await expect(insertTradeWithJournal(db, userA.id, minimalTrade, minimalJournal)).rejects.toThrow(
      'fallo simulado al insertar journal',
    )

    const trasFallo = await listTrades(db, userA.id)
    expect(trasFallo).toHaveLength(0)
  })
})
