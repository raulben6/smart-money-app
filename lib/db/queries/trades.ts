import { and, desc, eq, inArray } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/lib/db/schema'
import {
  trades,
  tradeJournals,
  tradeCaptures,
  type DbTrade,
  type DbJournal,
  type DbCapture,
} from '@/lib/db/schema'
import type { TradeFormValues, JournalFormValues } from '@/lib/validation/trade'

/**
 * Tipo de base de datos compartido por las queries de esta capa. Usamos la base
 * genérica de pg-core (`PgDatabase<PgQueryResultHKT, typeof schema>`) en vez del
 * tipo concreto de un driver (`NeonHttpDatabase` o `PgliteDatabase`) porque ambos
 * son subtipos estructurales de esta clase y así una misma función sirve tanto
 * para producción (Neon vía `getDb()`) como para los tests (PGlite vía
 * `createTestDb()`). Solo se usa la API "core" del query builder
 * (`db.select().from(...)`, `db.insert(...)`, etc.) y NUNCA la API relacional
 * `db.query.*`, cuyo tipado depende del parámetro `TSchema` derivado (que sí
 * difiere de forma incompatible entre drivers).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const emptyJournalValues: JournalFormValues = {
  whyTook: '',
  whatSaw: '',
  followedPlan: '',
  didWell: '',
  didWrong: '',
  improve: '',
  emotions: { antes: [], durante: [], despues: [] },
}

/** Lista los trades del usuario, más recientes primero (por fecha de la operación y luego por creación). */
export async function listTrades(db: Db, userId: string): Promise<DbTrade[]> {
  return db
    .select()
    .from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.tradeDate), desc(trades.createdAt))
}

/** Detalle de un trade (con su journal y capturas) sólo si pertenece al usuario; si no, `null`. */
export async function getTradeDetail(
  db: Db,
  userId: string,
  tradeId: string,
): Promise<{ trade: DbTrade; journal: DbJournal | null; captures: DbCapture[] } | null> {
  const [trade] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))

  if (!trade) return null

  const [journal] = await db.select().from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))
  const captures = await db.select().from(tradeCaptures).where(eq(tradeCaptures.tradeId, tradeId))

  return { trade, journal: journal ?? null, captures }
}

/**
 * Inserta un trade y, siempre, su fila de journal asociada (aunque `journal` venga
 * indefinido se crea con textos vacíos y sin emociones) para que el modo edición
 * encuentre siempre un journal al que hacer upsert. Si la inserción del journal
 * falla, se borra el trade recién insertado (compensación manual: el driver HTTP
 * de Neon no soporta transacciones interactivas) y se relanza el error original.
 */
export async function insertTradeWithJournal(
  db: Db,
  userId: string,
  values: TradeFormValues,
  journal?: JournalFormValues,
): Promise<string> {
  const [trade] = await db
    .insert(trades)
    .values({ ...values, userId })
    .returning()

  try {
    // `tradeId` se fija DESPUÉS del spread a propósito: si `journal` llegara con una
    // clave `tradeId` propia (payload hostil que hoy Zod ya filtra, pero esta función
    // no debe depender de eso), no debe poder "re-parentar" el journal a otro trade.
    await db.insert(tradeJournals).values({ ...(journal ?? emptyJournalValues), tradeId: trade.id })
  } catch (err) {
    await db.delete(trades).where(eq(trades.id, trade.id))
    throw err
  }

  return trade.id
}

/**
 * Actualiza un trade sólo si pertenece al usuario; `false` si no existe o no es suyo.
 * `userId` e `id` se re-fijan al final del `.set(...)` (después del spread de
 * `values`) para que una clave `userId`/`id` dentro de `values` nunca pueda
 * transferir la propiedad del trade ni reescribir su clave primaria.
 */
export async function updateTradeById(
  db: Db,
  userId: string,
  tradeId: string,
  values: TradeFormValues,
): Promise<boolean> {
  const result = await db
    .update(trades)
    .set({ ...values, updatedAt: new Date(), userId, id: tradeId })
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
    .returning()

  return result.length > 0
}

/**
 * Crea o actualiza el journal de un trade del usuario (upsert manual: la tabla
 * `trade_journals` no tiene `userId`, así que la autorización se verifica
 * primero contra el trade dueño). `false` si el trade no existe o no es suyo.
 */
export async function upsertJournal(
  db: Db,
  userId: string,
  tradeId: string,
  journal: JournalFormValues,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))

  if (!owned) return false

  const [existing] = await db.select({ tradeId: tradeJournals.tradeId }).from(tradeJournals).where(eq(tradeJournals.tradeId, tradeId))

  if (existing) {
    // `tradeId` se fija al final: una clave `tradeId` hostil dentro de `journal`
    // no puede re-parentar la fila (cambiar su PK) hacia otro trade.
    await db
      .update(tradeJournals)
      .set({ ...journal, updatedAt: new Date(), tradeId })
      .where(eq(tradeJournals.tradeId, tradeId))
  } else {
    await db.insert(tradeJournals).values({ ...journal, tradeId })
  }

  return true
}

/** Borra un trade sólo si pertenece al usuario (cascade borra journal y capturas); `false` si no existe o no es suyo. */
export async function deleteTradeById(db: Db, userId: string, tradeId: string): Promise<boolean> {
  const result = await db
    .delete(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))
    .returning()

  return result.length > 0
}

/**
 * Captura de un trade sólo si pertenece al usuario (join con `trades` filtrando
 * por `userId`, ya que `trade_captures` no tiene columna `userId` propia);
 * `null` si no existe o no es suya.
 */
export async function getCaptureForUser(db: Db, userId: string, captureId: string): Promise<DbCapture | null> {
  const [row] = await db
    .select({ capture: tradeCaptures })
    .from(tradeCaptures)
    .innerJoin(trades, eq(tradeCaptures.tradeId, trades.id))
    .where(and(eq(tradeCaptures.id, captureId), eq(trades.userId, userId)))

  return row?.capture ?? null
}

/**
 * Crea o actualiza la captura de una fase (`before`/`after`) de un trade del
 * usuario (upsert manual sobre el índice único `trade_id`+`phase`, ya subido el
 * archivo a Blob); `null` si el trade no existe o no es del usuario. Devuelve
 * el id de la fila resultante (nueva o reemplazada).
 */
export async function upsertCapture(
  db: Db,
  userId: string,
  tradeId: string,
  phase: 'before' | 'after',
  blobPathname: string,
  contentType: string,
): Promise<string | null> {
  const [owned] = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.userId, userId)))

  if (!owned) return null

  const [row] = await db
    .insert(tradeCaptures)
    .values({ tradeId, phase, blobPathname, contentType })
    .onConflictDoUpdate({
      target: [tradeCaptures.tradeId, tradeCaptures.phase],
      set: { blobPathname, contentType, createdAt: new Date() },
    })
    .returning()

  return row.id
}

/**
 * Borra la fila de una captura sólo si pertenece a un trade del usuario
 * (subconsulta contra `trades.userId`, ya que `trade_captures` no tiene
 * columna `userId` propia); `false` si no existe o no es suya. No borra el
 * blob en Vercel Blob: eso es responsabilidad de quien llama, antes de borrar
 * la fila (si el blob se borra pero la fila queda, `getCaptureForUser` seguiría
 * devolviendo una referencia rota; el orden inverso es más seguro).
 */
export async function deleteCaptureById(db: Db, userId: string, captureId: string): Promise<boolean> {
  const ownedTradeIds = db.select({ id: trades.id }).from(trades).where(eq(trades.userId, userId))

  const result = await db
    .delete(tradeCaptures)
    .where(and(eq(tradeCaptures.id, captureId), inArray(tradeCaptures.tradeId, ownedTradeIds)))
    .returning()

  return result.length > 0
}
