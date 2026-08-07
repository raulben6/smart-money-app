import { sql } from 'drizzle-orm'
import { pgTable, pgEnum, uuid, text, date, time, numeric, timestamp, jsonb, uniqueIndex, index, integer, boolean, primaryKey } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('role', ['student', 'mentor'])
export const marketEnum = pgEnum('market', ['indices', 'acciones', 'opciones', 'futuros', 'forex', 'cripto'])
export const directionEnum = pgEnum('direction', ['long', 'short'])
export const capturePhaseEnum = pgEnum('capture_phase', ['before', 'after'])
export const goalKindEnum = pgEnum('goal_kind', ['ganancia', 'operaciones', 'win_rate', 'riesgo_diario', 'manual'])
export const notificationKindEnum = pgEnum('notification_kind', ['felicitacion', 'correccion', 'recordatorio', 'observacion', 'progreso'])

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' })

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  role: roleEnum('role').notNull().default('student'),
  name: text('name').notNull().default(''),
  // Correo primario VERIFICADO de Clerk, en minúsculas (ronda 17): permite
  // reconectar el historial cuando un correo re-invitado vuelve a entrar con
  // un clerkId nuevo. null hasta el primer login posterior a esta migración
  // (se rellena en requireUser) o si el correo aún no está verificado.
  email: text('email'),
  // Baja del programa (ronda 17): timestamp = archivado (fuera del panel,
  // métricas y escrituras del mentor; datos preservados). null = activo.
  archivedAt: timestamp('archived_at'),
  initialBalance: money('initial_balance'), // null hasta completar onboarding
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Asignación manual de nivel (ronda 16): el estudiante arranca en este
  // nivel (position, default 1 = sin asignación) y el dinero de la escalera
  // se mide desde el netPnl que tenía al asignarlo (el nivel asignado
  // arranca desde cero). Ver computeLevelStatus en lib/metrics/levels.ts.
  startLevelPosition: integer('start_level_position').notNull().default(1),
  levelBaselineNet: money('level_baseline_net').notNull().default(0),
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

export const levels = pgTable('levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  position: integer('position').notNull().unique(),
  name: text('name').notNull(),
  goalAmount: money('goal_amount').notNull(),
  minProfitFactor: numeric('min_profit_factor', { precision: 6, scale: 2, mode: 'number' }),
  minTrades: integer('min_trades'),
  maxDrawdownPct: numeric('max_drawdown_pct', { precision: 6, scale: 2, mode: 'number' }),
  manualUnlock: boolean('manual_unlock').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const manualLevelGrants = pgTable('manual_level_grants', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  levelId: uuid('level_id').notNull().references(() => levels.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.levelId] })])

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: goalKindEnum('kind').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  targetValue: numeric('target_value', { precision: 12, scale: 2, mode: 'number' }).notNull(),
  thresholdValue: numeric('threshold_value', { precision: 6, scale: 2, mode: 'number' }),
  manualProgress: numeric('manual_progress', { precision: 5, scale: 1, mode: 'number' }),
  startDate: date('start_date').notNull(),
  dueDate: date('due_date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('goals_user_idx').on(t.userId)])

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: notificationKindEnum('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tradeId: uuid('trade_id').references(() => trades.id, { onDelete: 'set null' }),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('notifications_user_read_idx').on(t.userId, t.readAt),
  index('notifications_user_created_idx').on(t.userId, t.createdAt),
  // Dedupe ATÓMICO de las felicitaciones de nivel del sistema (ronda 16, fix
  // del revisor): el check-then-insert de la app no basta bajo concurrencia
  // (dos trades guardados a la vez). Índice único parcial acotado por la forma
  // exacta del título de sistema — el feedback libre del mentor no lo toca.
  uniqueIndex('notifications_levelup_unique')
    .on(t.userId, t.title)
    .where(sql`kind = 'felicitacion' AND title LIKE '¡Felicidades! Superaste el nivel %'`),
])

export type DbUser = typeof users.$inferSelect
export type DbTrade = typeof trades.$inferSelect
export type DbJournal = typeof tradeJournals.$inferSelect
export type DbCapture = typeof tradeCaptures.$inferSelect
export type DbLevel = typeof levels.$inferSelect
export type DbLevelGrant = typeof manualLevelGrants.$inferSelect
export type DbGoal = typeof goals.$inferSelect
export type DbNotification = typeof notifications.$inferSelect
