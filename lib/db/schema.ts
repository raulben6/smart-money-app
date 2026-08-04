import { pgTable, pgEnum, uuid, text, date, time, numeric, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['student', 'mentor'])
export const marketEnum = pgEnum('market', ['indices', 'acciones', 'opciones', 'futuros', 'forex', 'cripto'])
export const directionEnum = pgEnum('direction', ['long', 'short'])
export const capturePhaseEnum = pgEnum('capture_phase', ['before', 'after'])

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' })

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  role: roleEnum('role').notNull().default('student'),
  name: text('name').notNull().default(''),
  initialBalance: money('initial_balance'), // null hasta completar onboarding
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tradeDate: date('trade_date').notNull(),
  asset: text('asset').notNull(),
  market: marketEnum('market').notNull(),
  direction: directionEnum('direction').notNull(),
  entryTime: time('entry_time'),
  exitTime: time('exit_time'),
  entryPrice: money('entry_price'),
  exitPrice: money('exit_price'),
  contracts: numeric('contracts', { precision: 12, scale: 4, mode: 'number' }),
  positionSize: money('position_size'),
  stopLoss: money('stop_loss'),
  takeProfit: money('take_profit'),
  riskUsd: money('risk_usd'),
  riskPct: numeric('risk_pct', { precision: 6, scale: 3, mode: 'number' }),
  pnlUsd: money('pnl_usd').notNull(),
  rMultiple: numeric('r_multiple', { precision: 8, scale: 2, mode: 'number' }),
  setup: text('setup').notNull().default(''),
  timeframe: text('timeframe').notNull().default(''),
  marketConditions: text('market_conditions'),
  entryType: text('entry_type'),
  confirmations: text('confirmations'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('trades_user_date_idx').on(t.userId, t.tradeDate)])

export type Emotions = { antes: string[]; durante: string[]; despues: string[] }

export const tradeJournals = pgTable('trade_journals', {
  tradeId: uuid('trade_id').primaryKey().references(() => trades.id, { onDelete: 'cascade' }),
  whyTook: text('why_took').notNull().default(''),
  whatSaw: text('what_saw').notNull().default(''),
  followedPlan: text('followed_plan').notNull().default(''),
  didWell: text('did_well').notNull().default(''),
  didWrong: text('did_wrong').notNull().default(''),
  improve: text('improve').notNull().default(''),
  emotions: jsonb('emotions').$type<Emotions>().notNull().default({ antes: [], durante: [], despues: [] }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const tradeCaptures = pgTable('trade_captures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tradeId: uuid('trade_id').notNull().references(() => trades.id, { onDelete: 'cascade' }),
  phase: capturePhaseEnum('phase').notNull(),
  blobPathname: text('blob_pathname').notNull(),
  contentType: text('content_type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('captures_trade_phase_idx').on(t.tradeId, t.phase)])

export type DbUser = typeof users.$inferSelect
export type DbTrade = typeof trades.$inferSelect
export type DbJournal = typeof tradeJournals.$inferSelect
export type DbCapture = typeof tradeCaptures.$inferSelect
