# Smart Money App — Plan de implementación Fase 2 (Rol Mentor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir el rol mentor completo (panel de grupo, vistas por alumno, comparador, objetivos, niveles editables, retroalimentación→notificaciones e invitaciones desde la app) sobre la base de Fase 1, saldando primero la deuda técnica señalada por el auditor final.

**Architecture:** Misma app Next.js. Promoción de mentor por `MENTOR_EMAIL`; `requireMentor()` + queries espejo con verificación de rol interna (testeable en PGlite). Nivel y progreso de objetivos SIEMPRE calculados desde trades (`lib/metrics`, TDD). Las páginas de dashboard/calendario se refactorizan a componentes `*View` parametrizados (`readOnly`, `basePath`) reutilizados por las rutas de mentor `/estudiantes/[id]/...`. Grupo de rutas `app/(mentor)/` con su propio layout/nav.

**Tech Stack:** El de Fase 1 (Next 16, TS, Tailwind v4 + Nocturne, Clerk 7, Drizzle + Neon, Blob, Zod v4, Vitest + PGlite). Nuevo: API backend de Clerk (`clerkClient().invitations`) para invitaciones.

## Global Constraints

- Todas las Global Constraints del plan de Fase 1 siguen vigentes (español, tokens Nocturne sin hex, `await auth()`, `getDb()` perezoso, fechas string `YYYY-MM-DD` sin `new Date(str)`, dinero `numeric(12,2) mode number`, nunca `userId` del cliente en actions, commits con trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, Windows sin `&&` en PowerShell).
- Patrón de actions OBLIGATORIO (copiar de `lib/actions/trades.ts`): `'use server'` → `requireUser()`/`requireMentor()` → guards de uuid con `isValidUuid` → `safeParse` Zod → query → `revalidatePath` → `ActionResult`; catch con `console.error('[nombre]', err)` y mensaje español.
- Las queries de estudiante existentes NO se modifican para dar acceso al mentor; el acceso mentor va SIEMPRE por `lib/db/queries/mentor.ts` (u homólogos goals/levels/notifications) verificando el rol DENTRO de la query.
- El mentor nunca escribe trades/journals/capturas de estudiantes.
- Métricas/nivel/progreso: funciones puras en `lib/metrics` (TDD), nunca almacenadas.
- Mockup de referencia: `_design/smart-money-app.dc.html` — panel/ranking 346-377, comparador 379-403 y métricas 731-740, notificaciones 254-276 y 774-780, objetivos 279-306 y 782-791, niveles 308-344 y 793-809, banner de nivel 194-215, feedback del mentor 524-529, selector "Viendo a" 74-83, navs 596-598.
- Tests: PGlite replay de `drizzle/` (helper existente `lib/db/__tests__/helpers.ts`); el nuevo patrón de tests de actions (Task 3) se usa para TODAS las actions nuevas.
- Rama de trabajo: `fase-2` desde `master`.

---

### Task 1: requireMentor + React.cache + promoción por MENTOR_EMAIL + script db:migrate

**Files:**
- Modify: `lib/auth.ts`, `package.json`
- Create: ninguno

**Interfaces:**
- Consumes: `users` schema (tiene `role: 'student'|'mentor'`), `currentUser()` de Clerk.
- Produces: `requireUser(): Promise<DbUser>` (misma firma, ahora memoizada por request con `React.cache` y con promoción de mentor); `requireMentor(): Promise<DbUser>` — llama `requireUser()`, si `role !== 'mentor'` → `redirect('/dashboard')`; script npm `"db:migrate": "dotenv -e .env.local -- drizzle-kit migrate"`.

- [ ] **Step 1: Reescribir `lib/auth.ts`**

```ts
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
  const primaryEmail = cu?.primaryEmailAddress?.emailAddress

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
```

Nota: `cache()` memoiza por request de RSC; en Server Actions cada invocación resuelve de nuevo — correcto.

- [ ] **Step 2: Añadir el script** `"db:migrate": "dotenv -e .env.local -- drizzle-kit push"` — NO: usar `drizzle-kit migrate` (el flujo generate+migrate de Fase 1): `"db:migrate": "dotenv -e .env.local -- drizzle-kit migrate"` y `"db:generate": "dotenv -e .env.local -- drizzle-kit generate"`.

- [ ] **Step 3: Verificar** — `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (75/75), `npm run build` limpios. El controlador añade `MENTOR_EMAIL` a Vercel/.env.local fuera de esta tarea; usa un valor dummy local si necesitas probar (`$env:MENTOR_EMAIL='x@y.z'` en una shell puntual, sin persistirlo).

- [ ] **Step 4: Commit** `feat: requireMentor, cache por request y promocion por MENTOR_EMAIL`.

---

### Task 2: Consolidar helpers de fecha y meses en lib/format

**Files:**
- Modify: `lib/format.ts`, `app/(app)/calendario/page.tsx`, `app/(app)/dashboard/page.tsx`, `components/calendar/MonthGrid.tsx`, `components/trade-modal/TradeModal.tsx`, `components/trade-modal/TradeModalGate.tsx`
- Test: `lib/metrics/__tests__/periods.test.ts` (los casos de format viven ahí — añadir los nuevos)

**Interfaces:**
- Produces en `lib/format.ts`: `MONTH_NAMES_ES` (`['Enero',...,'Diciembre']`), `MONTH_NAMES_ES_SHORT` (`['Ene',...,'Dic']` — mover desde `lib/metrics/periods.ts`, que pasa a importarlo), `todayLocalISO(): string` (YYYY-MM-DD local), `formatDayMonth(iso: string): string` ('3 ago'), `formatLongDate(iso: string): string` ('3 de agosto, 2026').

- [ ] **Step 1: Tests** de los 3 formateadores (fechas fijas, sin Date del sistema salvo `todayLocalISO` que se prueba solo por formato regex). RED → implementar → GREEN.
- [ ] **Step 2: Migrar consumidores** — eliminar `MONTH_NAMES` (calendario/page), `MONTHS_ES` (dashboard/page), `MONTH_NAMES_LOWER` (MonthGrid y TradeModal), `todayLocal` duplicados (TradeModalGate, dashboard/page, MonthGrid) reemplazándolos por los imports de `lib/format`. Grep final: `grep -rn "Enero\|MONTH_NAMES\|todayLocal" app components lib` debe resolver solo a `lib/format.ts` y `lib/metrics/periods.ts` (re-export).
- [ ] **Step 3: Verificar** suite completa + build. **Step 4: Commit** `refactor: helpers de fecha y meses unificados en lib/format`.

---

### Task 3: Patrón de tests de actions con auth simulada

**Files:**
- Create: `lib/actions/__tests__/helpers.ts`, `lib/actions/__tests__/trades.actions.test.ts`

**Interfaces:**
- Consumes: `createTestDb` de `lib/db/__tests__/helpers.ts`; actions existentes de `lib/actions/trades.ts`.
- Produces: patrón reutilizable: `mockAuthAs(user: DbUser)` + `mockDb(db)` — Tasks 10+ escriben sus tests de actions con este helper.

- [ ] **Step 1: Helper**

```ts
// lib/actions/__tests__/helpers.ts
import { vi } from 'vitest'
import type { DbUser } from '@/lib/db/schema'

// vi.mock es hoisted: estos mocks se declaran EN CADA archivo de test (ver test de ejemplo),
// este helper solo comparte el estado mutable que los factories leen.
export const authState: { user: DbUser | null } = { user: null }
export const dbState: { db: unknown } = { db: null }

export function mockAuthAs(user: DbUser | null) { authState.user = user }
export function useTestDb(db: unknown) { dbState.db = db }
```

En cada archivo de test:

```ts
vi.mock('@/lib/auth', () => ({
  requireUser: async () => {
    if (!authState.user) throw new Error('REDIRECT:/sign-in')
    return authState.user
  },
  requireMentor: async () => {
    if (!authState.user || authState.user.role !== 'mentor') throw new Error('REDIRECT:/dashboard')
    return authState.user
  },
}))
vi.mock('@/lib/db', () => ({ getDb: () => dbState.db }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
```

- [ ] **Step 2: Tests de las actions existentes** (`trades.actions.test.ts`): sembrar user A y B en PGlite; (a) `createTrade` válido con A → `ok:true` y fila en DB; (b) `createTrade` payload inválido → `ok:false` con `fieldErrors`; (c) `updateTrade` con tradeId no-uuid → `ok:false` SIN_PERMISO; (d) `updateTrade` de A sobre trade de B → `ok:false` y fila intacta; (e) `removeTrade` no-uuid → `ok:false`. RED (helper inexistente) → GREEN.
- [ ] **Step 3: Suite completa + build. Commit** `test: capa de actions con auth simulada sobre PGlite`.

---

### Task 4: Navegación multi-trade por día (?dia=)

**Files:**
- Create: `components/calendar/DayTradesPanel.tsx` (server)
- Modify: `components/calendar/MonthGrid.tsx`, `app/(app)/calendario/page.tsx`, `components/trade-modal/TradeModalGate.tsx`

**Interfaces:**
- Consumes: `listTrades`, `money`/`signedMoney`/`formatLongDate` (Task 2), clases Nocturne.
- Produces: en calendario, `?dia=YYYY-MM-DD` abre un panel modal-ligero (backdrop + tarjeta centrada, mismo patrón visual `.dialog` que el confirm de Nocturne) listando las operaciones de ese día: Activo, dirección (chip verde/rojo), setup, R, P&L — cada fila `<Link href="?y&m&trade=<id>">`, botón "+ Registrar en este día" → `?y&m&nuevo=1&fecha=<dia>`, botón cerrar → quita `dia`. `DayTradesPanel({ dateISO, trades, closeHref, y, m })`.

- [ ] **Step 1:** `MonthGrid`: celda con `count > 1` enlaza a `?y&m&dia=<fecha>`; con `count === 1` mantiene `?trade=`; sin trades mantiene `?nuevo=1&fecha=`. `aria-label` del día con varias: "3 de agosto, +$420, 2 operaciones — ver lista".
- [ ] **Step 2:** `calendario/page.tsx`: si `searchParams.dia` válido (regex fecha) y sin `trade`/`nuevo` activos, renderizar `DayTradesPanel` con los trades de ese día (ya están en memoria). El botón "+ Registrar trade" del header pasa a llevar `?y&m&nuevo=1` del mes visible (cierra el minor T12-F1).
- [ ] **Step 3:** Verificación: build + suite; trazar manualmente los tres estados de celda en el código. **Commit** `feat: lista de operaciones por dia en el calendario`.

---

### Task 5: A11y del modal + escape de descarte del autosave

**Files:**
- Modify: `components/trade-modal/TradeModal.tsx`, `components/trade-modal/fields.tsx`, `components/trade-modal/JournalSection.tsx`, `components/trade-modal/steps.ts`

**Interfaces:**
- Consumes: todo existente. Produces: sin cambios de API — mejoras internas.

- [ ] **Step 1: Focus trap** — en el efecto de montaje del modal: listener de `keydown` Tab que cicla el foco entre los elementos focusables del dialog (`querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')` filtrados por visibilidad); Shift+Tab inverso.
- [ ] **Step 2: Errores accesibles** — `fields.tsx`: cuando hay error, el input recibe `aria-invalid` y `aria-describedby={fieldId + '-error'}`; el nodo de error lleva ese id. Required markers (`*` + `aria-required`) en `tradeDate`, `asset`, `market`, `direction` (además de `pnlUsd`, marcando en `steps.ts` `required: true`). Pestañas de edición con `role="tablist"`/`role="tab"`/`aria-selected` y paneles `role="tabpanel"`. Fallback de `aria-labelledby`: si el título computado queda vacío usar 'Registrar operación'.
- [ ] **Step 3: Escape de descarte** — `JournalSection`: contador de fallos consecutivos de flush; al llegar a 2, `TradeModal` muestra junto al formError un botón `.btn btn-ghost` (texto `--neg`) "Descartar cambios y cerrar" que: guarda el estado del journal en `localStorage` (`smartmoney.journal-stash.<tradeId>`), y cierra incondicionalmente. Al reabrir ese trade en edición, si existe stash más nuevo que `journal.updatedAt`, ofrecer restaurarlo (barra con "Tienes cambios sin guardar de una sesión anterior — Restaurar / Descartar") y limpiarlo al usarlo.
- [ ] **Step 4:** Suite + build + lint. **Commit** `feat: focus trap, errores accesibles y descarte seguro del autosave`.

---

### Task 6: Migración Fase 2 — levels, manual_level_grants, goals, notifications

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0001_*.sql` (generada) + edición manual del SQL para el seed de niveles

**Interfaces:**
- Produces (exports de `lib/db/schema.ts`): `goalKindEnum` (`ganancia|operaciones|win_rate|riesgo_diario|manual`), `notificationKindEnum` (`felicitacion|correccion|recordatorio|observacion|progreso`), tablas `levels`, `manualLevelGrants`, `goals`, `notifications` y tipos `DbLevel`, `DbGoal`, `DbNotification`, `DbLevelGrant`.

- [ ] **Step 1: Schema** — añadir a `lib/db/schema.ts` (mismo estilo del archivo):

```ts
export const goalKindEnum = pgEnum('goal_kind', ['ganancia', 'operaciones', 'win_rate', 'riesgo_diario', 'manual'])
export const notificationKindEnum = pgEnum('notification_kind', ['felicitacion', 'correccion', 'recordatorio', 'observacion', 'progreso'])

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
}, (t) => [index('notifications_user_read_idx').on(t.userId, t.readAt), index('notifications_user_created_idx').on(t.userId, t.createdAt)])
```

(Imports nuevos: `integer`, `boolean`, `primaryKey` de `drizzle-orm/pg-core`.) Exportar los 4 tipos `$inferSelect`.

- [ ] **Step 2: Generar y sembrar** — `npm run db:generate` → editar el SQL generado añadiendo al final los INSERT del seed (idempotencia no necesaria: la migración corre una vez):

```sql
INSERT INTO "levels" ("position", "name", "goal_amount", "min_profit_factor", "min_trades", "max_drawdown_pct", "manual_unlock") VALUES
(1, 'Nivel 1', 500, NULL, 10, NULL, false),
(2, 'Nivel 2', 1000, 1.5, 20, 10, false),
(3, 'Nivel 3', 2000, 1.8, 30, 8, false),
(4, 'Nivel 4', 5000, 2.0, 50, 6, false),
(5, 'Nivel 5 · Cuenta fondeada', 5000, 2.0, 50, 6, true);
```

⚠️ drizzle-kit calcula hash del SQL al aplicar: editar el archivo ANTES de `npm run db:migrate`. Aplicar y verificar con `scripts/db-check.ts` ampliado o consulta puntual (`select count(*) from levels` → 5).

- [ ] **Step 3:** Los tests PGlite existentes deben seguir en verde (replayan `drizzle/` completo — ahora con 0001 y su seed). Suite + build. **Commit** `feat: esquema Fase 2 (levels con seed, grants, goals, notifications)`.

---

### Task 7: lib/metrics Fase 2 — drawdown, niveles y objetivos (TDD)

**Files:**
- Create: `lib/metrics/levels.ts`, `lib/metrics/goals.ts`
- Test: `lib/metrics/__tests__/levels.test.ts`, `lib/metrics/__tests__/goals.test.ts`

**Interfaces:**
- Consumes: `TradePoint`, `computeSummary`, `equityPoints` de lib/metrics.
- Produces:
  - `maxDrawdownPct(balances: number[]): number` — mayor caída pico-a-valle en % (positivo; 0 si nunca cae). En `lib/metrics/levels.ts`.
  - `type LevelDef = { id: string; position: number; name: string; goalAmount: number; minProfitFactor: number | null; minTrades: number | null; maxDrawdownPct: number | null; manualUnlock: boolean }` (estructural — `DbLevel` lo satisface).
  - `computeLevelStatus(input: { trades: TradePoint[]; initialBalance: number; levels: LevelDef[]; grantedLevelIds: string[] }): LevelStatus` con `type LevelStatus = { current: LevelDef | null; next: LevelDef | null; progressPct: number; perLevel: { level: LevelDef; state: 'completado' | 'en_curso' | 'bloqueado'; requirements: { label: string; value: string; met: boolean }[] }[] }`. Regla: un nivel está `completado` si netPnl ≥ goalAmount Y (PF ≥ minProfitFactor si definido) Y (total ≥ minTrades si definido) Y (drawdown ≤ maxDrawdownPct si definido) Y (si `manualUnlock`, su id ∈ grantedLevelIds). `current` = el completado de mayor `position` (o null); `en_curso` = el siguiente; posteriores `bloqueado`. `progressPct` = min(100, netPnl/goalAmount del `next` × 100) (0 si next null → 100).
  - `type GoalDef = { kind: 'ganancia'|'operaciones'|'win_rate'|'riesgo_diario'|'manual'; targetValue: number; thresholdValue: number | null; manualProgress: number | null; startDate: string; dueDate: string }` (estructural — `DbGoal` lo satisface).
  - `type GoalTradePoint = TradePoint & { riskPct: number | null }` (DbTrade lo satisface).
  - `computeGoalProgress(goal: GoalDef, trades: GoalTradePoint[], todayISO: string): { current: number; pct: number; status: 'cumplido' | 'en_curso' | 'en_riesgo' | 'vencido' }` — ventana `startDate..dueDate` inclusive por comparación lexicográfica de strings; reglas del spec §4 (riesgo_diario: días consecutivos hasta `todayISO` sin que la suma diaria de riskPct exceda thresholdValue; un exceso reinicia). `en_riesgo` si pct < 50 y quedan ≤ 7 días; `vencido` si todayISO > dueDate y pct < 100; `cumplido` si pct ≥ 100.

- [ ] **Step 1: Tests de `maxDrawdownPct`** — monótona creciente → 0; caída simple 25000→24000 → 4%; pico-valle no adyacente; lista vacía/1 elemento → 0. RED → implementar → GREEN.
- [ ] **Step 2: Tests de `computeLevelStatus`** — (a) sin trades → current null, next nivel 1, todos bloqueados salvo nivel 1 en_curso; (b) netPnl 1995 con PF 2.9, 13 trades, dd bajo y los 5 niveles del seed → niveles 1-2 completados (nivel 2 requiere 20 trades: NO completado con 13 — cuidado, diseñar el caso con requisitos reales del seed: nivel 1 (500, minTrades 10) completado; nivel 2 (1000, PF1.5, 20 trades, dd10) NO por trades → current nivel 1, next nivel 2); (c) gate de PF retiene aunque la ganancia sobre; (d) `manualUnlock` sin grant bloquea, con grant completa; (e) drawdown excedido retiene. RED → implementar → GREEN.
- [ ] **Step 3: Tests de `computeGoalProgress`** — un caso por kind (con trades dentro y fuera de la ventana), estados: cumplido, en_riesgo (pct 40 con 5 días restantes), vencido, manual con manualProgress 60 → pct 60. riesgo_diario: día que excede reinicia el conteo (trazar caso con 3 días ok, 1 exceso, 2 ok → current 2). RED → implementar → GREEN.
- [ ] **Step 4:** Suite completa + build. **Commit** `feat: metricas de drawdown, niveles y objetivos con TDD`.

---

### Task 8: Validación Zod Fase 2

**Files:**
- Create: `lib/validation/mentor.ts`
- Test: `lib/validation/__tests__/mentor.test.ts`

**Interfaces:**
- Produces: `goalSchema` → `GoalFormValues` (`kind` enum; `name` 1-80; `description` max 500; `targetValue` `requiredNumber` positivo; `thresholdValue` requerido >0 y ≤100 SOLO si kind riesgo_diario (`.superRefine`), null en otros; `manualProgress` 0-100 nullable; `startDate`/`dueDate` fecha real con `startDate <= dueDate` (refine)); `levelSchema` → `LevelFormValues` (`name` 1-60, `goalAmount` positivo, `minProfitFactor`/`maxDrawdownPct` nullable >0, `minTrades` int nullable >0); `feedbackSchema` → `FeedbackFormValues` (`kind` notification enum; `title` 1-120; `body` 1-2000; `tradeId` uuid nullable); `inviteSchema` (`email` `z.email()` — Zod v4). Reutilizar `requiredNumber`/`optionalNumber`/patrones de `lib/validation/trade.ts` (importarlos si están exportados; si no, exportarlos desde allí en esta tarea).

- [ ] **Step 1: Tests** — por schema: caso válido, y los inválidos clave (riesgo_diario sin threshold falla; ganancia CON threshold falla o lo anula — decidir: se fuerza null y documenta; startDate > dueDate falla; email inválido falla; title vacío falla). RED → implementar (importando `@/lib/validation/zod-config` primero) → GREEN.
- [ ] **Step 2:** Suite + build. **Commit** `feat: esquemas de validacion del rol mentor`.

---

### Task 9: Queries Fase 2 con matriz de autorización (TDD PGlite)

**Files:**
- Create: `lib/db/queries/mentor.ts`, `lib/db/queries/goals.ts`, `lib/db/queries/levels.ts`, `lib/db/queries/notifications.ts`
- Test: `lib/db/queries/__tests__/mentor.test.ts`

**Interfaces:**
- Consumes: `Db` type y patrones de `lib/db/queries/trades.ts`; schema Task 6; `GoalFormValues`/`LevelFormValues` (Task 8).
- Produces (todas verifican rol mentor DENTRO de la query — patrón: primera subconsulta `assertMentor`):

```ts
// lib/db/queries/mentor.ts — patrón de verificación interna
async function isMentor(db: Db, mentorId: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, mentorId), eq(users.role, 'mentor'))).limit(1)
  return rows.length > 0
}
export async function listStudents(db: Db, mentorId: string): Promise<DbUser[]>            // [] si no es mentor; solo role='student'
export async function listTradesForStudent(db: Db, mentorId: string, studentId: string): Promise<DbTrade[]>  // [] si no es mentor o target no es student
export async function getTradeDetailForStudent(db: Db, mentorId: string, studentId: string, tradeId: string) // null si falla cualquier check; misma forma que getTradeDetail
export async function getCaptureForStudent(db: Db, mentorId: string, captureId: string): Promise<DbCapture | null>
```

- `goals.ts`: `listGoalsForUser(db, userId)` (propias), `listGoalsForStudent(db, mentorId, studentId)`, `insertGoal(db, mentorId, studentId, values: GoalFormValues): Promise<string | null>` (null si no autorizado), `updateGoalById(db, mentorId, goalId, values): Promise<boolean>`, `deleteGoalById(db, mentorId, goalId): Promise<boolean>`.
- `levels.ts`: `listLevels(db): Promise<DbLevel[]>` (orden position — lectura pública autenticada), `updateLevelById(db, mentorId, levelId, values: LevelFormValues): Promise<boolean>`, `grantLevel(db, mentorId, studentId, levelId): Promise<boolean>` (onConflictDoNothing), `revokeGrant(db, mentorId, studentId, levelId): Promise<boolean>`, `listGrantIdsForUser(db, userId): Promise<string[]>`.
- `notifications.ts`: `insertNotification(db, mentorId, values: { userId: string } & FeedbackFormValues): Promise<string | null>`, `listNotificationsForUser(db, userId): Promise<DbNotification[]>` (createdAt desc), `markAllReadForUser(db, userId): Promise<number>`, `unreadCountForUser(db, userId): Promise<number>`, `listSentNotifications(db, mentorId): Promise<(DbNotification & { studentName: string })[]>` (join users).
- Columnas de identidad SIEMPRE pineadas después de spreads (patrón Fase 1).

- [ ] **Step 1: Matriz de tests** (sembrar mentor M, estudiantes A y B): (a) `listStudents(M)` → [A,B]; `listStudents(A)` → []; (b) `listTradesForStudent(M, A)` → trades de A; `(A, B)` → []; (c) `getTradeDetailForStudent(M, A, tradeDeA)` → detalle; `(M, B, tradeDeA)` → null (studentId debe coincidir con el dueño); (d) goals: `insertGoal(M, A)` crea; `insertGoal(A, B)` → null; `updateGoalById(A, goalDeA)` → false (estudiante no edita ni sus propios goals); `listGoalsForUser(A)` → las suyas; (e) levels: `updateLevelById(A, ...)` → false; `grantLevel(M, A, nivel5)` → true y aparece en `listGrantIdsForUser(A)`; (f) notifications: `insertNotification(A, ...)` → null; `insertNotification(M, {userId: A})` → id; `listNotificationsForUser(B)` no ve las de A; `markAllReadForUser(A)` solo marca las de A; `unreadCountForUser` correcto antes/después; payload hostil con `userId`/`id` extra no re-parenta (test espejo del de Fase 1). RED → implementar → GREEN.
- [ ] **Step 2:** Suite completa + build. **Commit** `feat: queries de mentor, objetivos, niveles y notificaciones con matriz de autorizacion`.

---

### Task 10: Actions Fase 2 (con tests del patrón Task 3)

**Files:**
- Create: `lib/actions/mentor.ts`, `lib/actions/notifications.ts`
- Test: `lib/actions/__tests__/mentor.actions.test.ts`

**Interfaces:**
- Consumes: `requireMentor`/`requireUser` (Task 1), queries (Task 9), schemas (Task 8), `ActionResult`, `isValidUuid`, patrón de `lib/actions/trades.ts`, helpers de test (Task 3).
- Produces (`lib/actions/mentor.ts`, `'use server'`):
  - `sendFeedback(studentId: string, raw: unknown): Promise<ActionResult<{ id: string }>>` — feedbackSchema; revalida `/mensajes` y `/estudiantes/[id]` paths relevantes.
  - `createGoal(studentId: string, raw: unknown): Promise<ActionResult<{ id: string }>>`, `updateGoal(goalId: string, raw: unknown): Promise<ActionResult<null>>`, `removeGoal(goalId: string): Promise<ActionResult<null>>` — revalidan `/objetivos`.
  - `updateLevel(levelId: string, raw: unknown): Promise<ActionResult<null>>`, `grantStudentLevel(studentId: string, levelId: string): Promise<ActionResult<null>>`, `revokeStudentLevel(...)`: revalidan `/niveles` y `/mi-nivel`.
  - `inviteStudent(raw: unknown): Promise<ActionResult<null>>` — inviteSchema; `const client = await clerkClient()` (import de `@clerk/nextjs/server`); `client.invitations.createInvitation({ emailAddress, notify: true })`; error de Clerk por invitación duplicada → mensaje español claro ('Ya existe una invitación para ese correo').
  - `listPendingInvitations(): Promise<ActionResult<{ email: string; status: string; createdAt: number }[]>>` — via `client.invitations.getInvitationList()` (server action de lectura para la pantalla).
- `lib/actions/notifications.ts`: `markMyNotificationsRead(): Promise<ActionResult<null>>` (estudiante, propias — usa `markAllReadForUser` con el id de sesión).

- [ ] **Step 1: TDD con el patrón Task 3** — casos: estudiante llama `sendFeedback`/`createGoal`/`updateLevel` → rechazo (el mock de requireMentor lanza); mentor `createGoal` inválido → fieldErrors; mentor `sendFeedback` válido → notification en DB; `grantStudentLevel` con uuid inválido → SIN_PERMISO; `markMyNotificationsRead` de A no toca las de B. (Las actions de Clerk — invite/list — NO se testean unitariamente: red externa; se verifican en Task 17/18.) RED → implementar → GREEN.
- [ ] **Step 2:** Suite + build. **Commit** `feat: actions del rol mentor y notificaciones con tests`.

---

### Task 11: Shell por rol — nav mentor, badge de notificaciones y grupo (mentor)

**Files:**
- Create: `app/(mentor)/layout.tsx`, `components/shell/MentorSidebar.tsx`, `components/shell/MentorBottomNav.tsx`
- Modify: `app/(app)/layout.tsx`, `components/shell/Sidebar.tsx`, `components/shell/BottomNav.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `requireMentor`, `unreadCountForUser` (Task 9).
- Produces: grupo `(mentor)` con layout `requireMentor()` + shell propio; nav mentor (mockup 597): Panel general `/panel` (icono `SquaresFour`), Dashboard del alumno (deshabilitado sin alumno seleccionado — enlaza al último visto via cookie ligera o a `/panel`), Calendario del alumno (ídem), Comparador `/comparador` (`ArrowsLeftRight`), Objetivos `/objetivos` (`Target`), Niveles `/niveles` (`Medal`), Mensajes `/mensajes` (`EnvelopeSimple`), Invitaciones `/invitaciones` (`UserPlus`). Etiqueta de rol 'Mentor' (mockup 39). Estudiante: `Sidebar`/`BottomNav` ganan Notificaciones (badge con `unreadCount` — pastilla `bg-accent-800 text-accent-200` mockup 45), Objetivos y Mi nivel; el layout `(app)` obtiene `unreadCountForUser` y lo pasa por props. `app/page.tsx`: mentor → `/panel`, estudiante → flujo actual.

- [ ] **Step 1:** Layout `(mentor)` + MentorSidebar/MentorBottomNav (misma estructura visual que los de Fase 1 — leer esos archivos y calcar patrón, activo con inset accent). Simplificación móvil mentor: BottomNav con Panel, Comparador, Mensajes, Perfil (4 slots; el resto accesible desde Panel).
- [ ] **Step 2:** Badge del estudiante + items nuevos; `redirect` por rol en `app/page.tsx`.
- [ ] **Step 3:** Build + suite + gate 307 (curl). Nota: estudiante autenticado que visite `/panel` → redirect `/dashboard` (lo hace `requireMentor`); dejar test manual para Task 18. **Commit** `feat: shell del mentor y badge de notificaciones del estudiante`.

---

### Task 12: Refactor a vistas compartidas + rutas /estudiantes/[id]

**Files:**
- Create: `components/dashboard/DashboardView.tsx`, `components/calendar/CalendarView.tsx`, `app/(mentor)/estudiantes/[id]/dashboard/page.tsx`, `app/(mentor)/estudiantes/[id]/calendario/page.tsx`, `components/shell/StudentPicker.tsx` (client select)
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/calendario/page.tsx`, `components/trade-modal/TradeModalGate.tsx`, `components/trade-modal/TradeModal.tsx`

**Interfaces:**
- Consumes: queries mentor (Task 9), vistas existentes.
- Produces:
  - `DashboardView({ trades, initialBalance, displayName, readOnly, basePath })` y `CalendarView({ trades, y, m, searchParams, readOnly, basePath })` — TODO el cuerpo actual de las páginas se mueve aquí; las páginas de Fase 1 quedan como thin wrappers (auth + fetch + `<View basePath="/dashboard" | "/calendario">`). `basePath` alimenta los links internos (`?trade=`, `?dia=`, prev/next) para que funcionen bajo `/estudiantes/[id]/...`. `readOnly` oculta '+ Registrar trade' y los links `?nuevo=`.
  - Páginas mentor: `requireMentor()` → validar `[id]` uuid + `listTradesForStudent`; título del header = nombre del alumno (mockup 609: '{nombre}' / 'Dashboard del estudiante · mismo detalle que ve el alumno'); `StudentPicker` en el header ('Viendo a' + select, mockup 74-83) navega `router.push` a la misma subruta del otro alumno.
  - `TradeModalGate` acepta `{ mode: 'owner' } | { mode: 'mentor', studentId }`: en mentor usa `getTradeDetailForStudent` y monta `TradeModal` con `readOnly` (Task 13 de F1 ya tiene modo edit; `readOnly` deshabilita inputs — `fieldset disabled` + oculta Guardar/Eliminar; la Bitácora se muestra como texto). Las capturas del alumno se sirven vía `GET /api/captures/[id]` — AMPLIAR la route: si el solicitante es mentor, autorizar con `getCaptureForStudent` (fallback al flujo owner).
- [ ] **Step 1:** Extraer Views (mover código, sin cambios visuales — diff de render idéntico salvo props). Verificar suite/build.
- [ ] **Step 2:** Rutas mentor + StudentPicker + Gate modo mentor + route de capturas ampliada.
- [ ] **Step 3:** Build + suite. **Commit** `feat: vistas compartidas y dashboards/calendarios por alumno para el mentor`.

---

### Task 13: Panel general + Comparador

**Files:**
- Create: `app/(mentor)/panel/page.tsx`, `app/(mentor)/comparador/page.tsx`, `components/mentor/RankingTable.tsx`, `components/mentor/CompareChips.tsx` (client), `components/mentor/CompareBars.tsx`

**Interfaces:**
- Consumes: `listStudents`, `listTradesForStudent`, `computeSummary`, `maxDrawdownPct`, `equityPoints`, `computeLevelStatus`, `listLevels`, `money`/`pct`.
- Produces: `/panel` (mockup 346-377): 5 tarjetas (Estudiantes, Rentabilidad promedio, Win Rate promedio, Profit Factor promedio, Requieren atención = PF < 1 con nombre en sub) + tabla ranking (#, Estudiante, Nivel [tag], Balance, Win Rate, PF, Drawdown, botón Abrir → `/estudiantes/[id]/dashboard`), orden por rentabilidad % desc. `/comparador` (mockup 379-403): chips toggle client (estado en URL `?s=id1,id2`), 8 métricas de mockup 731-740 en filas de barras (ancho relativo al máx; valores tabular-nums). Sin estudiantes → estado vacío con CTA a `/invitaciones`.
- [ ] **Step 1:** Página panel (server: N+1 aceptable con pocos alumnos — cargar trades por alumno con `Promise.all`). **Step 2:** Comparador. **Step 3:** Build + suite. **Commit** `feat: panel general con ranking y comparador de estudiantes`.

---

### Task 14: Objetivos — CRUD mentor y vista estudiante

**Files:**
- Create: `app/(mentor)/objetivos/page.tsx`, `components/mentor/GoalForm.tsx` (client), `app/(app)/objetivos/page.tsx`, `components/goals/GoalCard.tsx`
- Modify: ninguno estructural

**Interfaces:**
- Consumes: goals queries/actions, `computeGoalProgress`, `listTradesForStudent`/`listTrades`, `todayLocalISO`.
- Produces: mentor `/objetivos`: selector de alumno (mismo `StudentPicker`, estado en `?e=<id>`), lista de `GoalCard` con botón Editar + botón '+ Nuevo objetivo' → `GoalForm` (modal ligero client con los campos por kind — al elegir kind se muestran/ocultan threshold/manualProgress; validación client con goalSchema + server action). Estudiante `/objetivos` (mockup 279-306): grid de `GoalCard` solo lectura. `GoalCard({ goal, progress, editable })` — barra de progreso (roja si `en_riesgo`, mockup 789), tag de estado (Cumplido verde / En riesgo rojo / En curso neutro, mockup 790), 'Vence {fecha}'. El progreso se calcula server-side en las páginas con `computeGoalProgress(goal, trades, todayLocalISO())`.
- [ ] **Step 1:** Componentes + página mentor. **Step 2:** Página estudiante. **Step 3:** Build + suite. **Commit** `feat: objetivos asignables con progreso auto-calculado`.

---

### Task 15: Niveles — editor mentor, grants y Mi nivel del estudiante

**Files:**
- Create: `app/(mentor)/niveles/page.tsx`, `components/mentor/LevelEditor.tsx` (client), `app/(app)/mi-nivel/page.tsx`, `components/levels/LevelProgressCard.tsx`, `components/levels/LevelCarousel.tsx`
- Modify: `app/(app)/calendario/page.tsx` (banner de nivel), `components/calendar/CalendarView.tsx`

**Interfaces:**
- Consumes: `listLevels`, `updateLevel`/`grantStudentLevel` actions, `computeLevelStatus`, `listGrantIdsForUser`, `listStudents`.
- Produces: mentor `/niveles`: lista editable de los 5 niveles (`LevelEditor` por fila: nombre, meta $, PF mín, trades mín, DD máx — submit por action) + sección 'Desbloqueo manual' (selector alumno + botón otorgar/revocar nivel `manualUnlock`). Estudiante `/mi-nivel` (mockup 308-344): `LevelProgressCard` (número de nivel con glow accent, objetivo, % completado, barra, grid de requisitos con met/pendiente en `--pos`/neutral) + `LevelCarousel` (5 tarjetas: completado verde / en curso accent / bloqueado 55% opacity, mockup 799-809). Banner de nivel sobre el calendario del ESTUDIANTE (mockup 194-215: número, nombre, objetivo, barra, 'Te faltan $X...', botón 'Ver mi nivel' → `/mi-nivel`) — solo en `CalendarView` cuando NO `readOnly`.
- [ ] **Step 1:** Estudiante (`/mi-nivel` + banner). **Step 2:** Mentor (`/niveles`). **Step 3:** Build + suite. **Commit** `feat: sistema de niveles calculado con editor del mentor`.

---

### Task 16: Feedback por trade + centros de notificaciones

**Files:**
- Create: `components/trade-modal/FeedbackSection.tsx` (client), `app/(app)/notificaciones/page.tsx`, `app/(mentor)/mensajes/page.tsx`, `components/notifications/NotificationCard.tsx`
- Modify: `components/trade-modal/TradeModal.tsx` (montar FeedbackSection en modo mentor)

**Interfaces:**
- Consumes: `sendFeedback`, `markMyNotificationsRead`, notifications queries, `formatLongDate`.
- Produces: en el modal readOnly del mentor, sección 'Retroalimentación del mentor' (mockup 524-529: título accent, select de tipo [las 5 kinds con labels: Felicitación/Corrección/Recordatorio/Observación/Progreso], input título, textarea con borde `--color-accent-800`, botón 'Enviar retroalimentación'; nota del footer 'Tu comentario llegará al estudiante al guardar'); envía `sendFeedback(studentId, { kind, title, body, tradeId })` → toastless: estado inline 'Enviado ✓'. Estudiante `/notificaciones` (mockup 254-276, datos 774-780): `NotificationCard` (icono por kind — usar Phosphor: `Medal`/`PencilSimple`/`ListChecks`/`Info`/`TrendUp` —, título, tag outline del kind, tiempo relativo ('Hace 2 h' — helper `relativeTime(date, now)` en `lib/format` con tests), cuerpo, botón 'Ver operación · {asset} · {fecha}' si tradeId → `/calendario?y&m&trade=` del trade); al montar, server action `markMyNotificationsRead()` (patrón: llamada en el server component tras render de datos — marcar DESPUÉS de leer la lista para que el usuario vea cuáles eran nuevas: separador 'Nuevas'/'Anteriores' según `readAt`). Mentor `/mensajes`: lista de `listSentNotifications` con nombre del alumno.
- [ ] **Step 1:** FeedbackSection + wiring modal. **Step 2:** `/notificaciones` + badge se apaga al visitarla. **Step 3:** `/mensajes`. **Step 4:** Build + suite. **Commit** `feat: retroalimentacion por operacion y centros de notificaciones`.

---

### Task 17: Invitaciones desde la app

**Files:**
- Create: `app/(mentor)/invitaciones/page.tsx`, `components/mentor/InviteForm.tsx` (client)

**Interfaces:**
- Consumes: `inviteStudent`, `listPendingInvitations` (Task 10).
- Produces: `/invitaciones`: tarjeta con `InviteForm` (input email + botón 'Enviar invitación', estados pending/éxito/error en español) + tabla de invitaciones (correo, estado [Pendiente/Aceptada/Revocada → tags], fecha) cargada server-side con `listPendingInvitations`. Estado vacío amable.
- [ ] **Step 1:** Página + form + action wiring. **Step 2:** Build + suite; verificación real del correo queda para Task 18 (smoke). **Commit** `feat: invitaciones de estudiantes desde la app`.

---

### Task 18: Endurecimiento, deploy y smoke test Fase 2

**Files:**
- Modify: `app/(mentor)/error.tsx` + `loading.tsx` de panel/comparador (skeletons `.card` `animate-pulse` con las grillas reales), `package.json` (`"name": "smart-money-app"` — cerrar el minor de Fase 1)

- [ ] **Step 1:** Error boundary del grupo mentor + skeletons + rename del package. Suite + build.
- [ ] **Step 2:** Commit `feat: endurecimiento de rutas mentor`. (El controlador añade `MENTOR_EMAIL` a Vercel en los 3 entornos vía `printf | vercel env add` — nunca PowerShell pipe — y redeploya.)
- [ ] **Step 3 (con el humano): checklist de aceptación del spec §9** en producción:
  1. `MENTOR_EMAIL` entra → `/panel`; otro usuario → app de estudiante y `/panel` lo expulsa.
  2. Mentor abre dashboard/calendario de un alumno (idéntico, solo lectura).
  3. Feedback desde un trade → badge + notificación del alumno con 'Ver operación' funcional.
  4. Objetivo asignado muestra progreso correcto; nivel calculado y editable; grant manual funciona.
  5. Invitación desde la app llega por correo y permite registrarse.
  6. Día con 2+ operaciones abre la lista y todas son accesibles.
  7. Responsive 1440/768/390 en pantallas nuevas.
- [ ] **Step 4:** `git tag fase-2` tras el smoke test verde.

---

## Notas de self-review del plan

- **Cobertura del spec §:** acceso/promoción (T1), queries espejo con rol interno (T9), tablas+seed (T6), cálculos puros (T7), UI mentor 8 rutas (T11-T17), estudiante 3 pantallas+badge+banner (T11, T14-T16), invitaciones (T17), prerrequisitos del auditor (T1-T5), criterios de aceptación (T18). Sin huecos detectados.
- **Consistencia de tipos:** `GoalFormValues`/`LevelFormValues`/`FeedbackFormValues` definidos en T8 y consumidos en T9/T10 con esos nombres; `LevelDef`/`GoalDef` estructurales satisfechos por `DbLevel`/`DbGoal`; `basePath`/`readOnly` de las Views (T12) usados por T13-T16.
- **Riesgo señalado:** la edición manual del SQL de migración (T6 seed) debe hacerse antes de `db:migrate`; el brief lo advierte. La route de capturas ampliada (T12) mantiene 404 uniforme para no filtrar existencia.
- **Decisión documentada:** goalSchema fuerza `thresholdValue: null` cuando kind ≠ riesgo_diario (T8), evitando datos incoherentes.
