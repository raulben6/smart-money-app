# Smart Money App — Plan de implementación Fase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo del estudiante de Smart Money App: auth por invitación (Clerk), registro de operaciones con bitácora/emociones/capturas, dashboard de métricas y calendario mensual — seguro, responsive y fiel al design system Nocturne.

**Architecture:** Next.js App Router (TS) en Vercel. Server Components leen la DB (Neon Postgres vía Drizzle) directamente; Server Actions escriben con validación Zod; Clerk protege todo por middleware; capturas en Vercel Blob privado servidas por route handler autenticada. Métricas siempre derivadas de los trades en `lib/metrics` (funciones puras, TDD).

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4 + tokens Nocturne, @clerk/nextjs v7, drizzle-orm + @neondatabase/serverless, @vercel/blob, Zod, Vitest, Phosphor Icons (@phosphor-icons/react).

## Global Constraints

- UI **en español**, moneda **USD** formateada `en-US` (`$1,595`), fuente **Inter**.
- Colores/espaciados/radios SIEMPRE desde tokens Nocturne (`_design/nocturne-styles.css`); prohibido hardcodear hex. Positivo: `oklch(0.76 0.11 162)` (`--pos`), negativo: `oklch(0.68 0.15 22)` (`--neg`), definidos una sola vez en `app/globals.css`.
- Botones delineados (nunca rellenos de acento), `:focus-visible` con anillo de acento, hover/pressed desde las ramps (ya lo hace `nocturne.css`).
- Clerk Core 3: `await auth()`, `await clerkClient()` — todo async.
- Drizzle + Neon: inicialización perezosa `getDb()` (función plana, **nunca** `Proxy`). `drizzle-kit`/scripts usan `npx dotenv -e .env.local --` porque no cargan `.env.local` solos.
- **Ninguna** query o acción acepta `userId` del cliente; siempre se resuelve de `await auth()`.
- Fechas de trade como string `YYYY-MM-DD` (columna `date`), sin conversiones de zona horaria.
- Dinero: `numeric(12,2)` con `{ mode: 'number' }` en Drizzle.
- Referencia visual obligatoria: `_design/smart-money-app.dc.html` (mockup) — los rangos de líneas citados por tarea son de ese archivo.
- Commits frecuentes estilo `feat:`/`fix:`/`chore:` terminando en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Windows/PowerShell: no usar `&&`; encadenar con `;`.

---

### Task 1: Scaffold Next.js + Vitest

**Files:**
- Create: proyecto Next.js completo en la raíz (`app/`, `package.json`, `tsconfig.json`, …)
- Create: `vitest.config.ts`, `lib/metrics/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: proyecto compilable con `npm run build`, tests con `npx vitest run`, alias `@/*`.

- [ ] **Step 1: Scaffold en carpeta temporal y mover a la raíz** (la raíz no está vacía: `_design/`, `docs/`, `.git`)

```powershell
npx create-next-app@latest smart-money-tmp --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
Get-ChildItem -Force smart-money-tmp | Move-Item -Destination . -Force
Remove-Item smart-money-tmp -Recurse -Force
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 3: Instalar Vitest y crear config + test humo**

```powershell
npm i -D vitest
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { include: ['lib/**/__tests__/**/*.test.ts'] },
})
```

```ts
// lib/metrics/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('vitest', () => {
  it('funciona', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 4: Ejecutar tests**

Run: `npx vitest run`
Expected: 1 passed.

- [ ] **Step 5: Añadir script y commit**

En `package.json` scripts: `"test": "vitest run"`.

```powershell
git add -A; git commit -m "chore: scaffold Next.js + Vitest`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tokens Nocturne + estilos base

**Files:**
- Create: `styles/nocturne.css` (copia de `_design/nocturne-styles.css`)
- Modify: `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Produces: variables CSS `--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--pos`, `--neg` disponibles globalmente; clases `.btn*`, `.card*`, `.tag*`, `.table`, `.input`, `.field`, `.seg`, `.dialog*`; utilidades Tailwind mapeadas (`bg-bg`, `bg-surface`, `text-text`, `text-neutral-400`, `border-neutral-800`, `text-accent`, `bg-accent-900`, `text-pos`, `text-neg`, etc.).

- [ ] **Step 1: Copiar `_design/nocturne-styles.css` a `styles/nocturne.css`** eliminando la línea `@import url('https://fonts.googleapis.com...')` (la fuente la sirve `next/font` — sin dependencia externa, mejor CSP).

- [ ] **Step 2: Reescribir `app/globals.css`**

```css
@import "tailwindcss";
@import "../styles/nocturne.css";

:root { --pos: oklch(0.76 0.11 162); --neg: oklch(0.68 0.15 22); }

@theme inline {
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-text: var(--color-text);
  --color-accent: var(--color-accent);
  --color-accent-100: var(--color-accent-100);
  --color-accent-200: var(--color-accent-200);
  --color-accent-300: var(--color-accent-300);
  --color-accent-400: var(--color-accent-400);
  --color-accent-500: var(--color-accent-500);
  --color-accent-600: var(--color-accent-600);
  --color-accent-700: var(--color-accent-700);
  --color-accent-800: var(--color-accent-800);
  --color-accent-900: var(--color-accent-900);
  --color-neutral-100: var(--color-neutral-100);
  --color-neutral-200: var(--color-neutral-200);
  --color-neutral-300: var(--color-neutral-300);
  --color-neutral-400: var(--color-neutral-400);
  --color-neutral-500: var(--color-neutral-500);
  --color-neutral-600: var(--color-neutral-600);
  --color-neutral-700: var(--color-neutral-700);
  --color-neutral-800: var(--color-neutral-800);
  --color-neutral-900: var(--color-neutral-900);
  --color-pos: var(--pos);
  --color-neg: var(--neg);
  --font-sans: var(--font-body);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
}

html, body { background: var(--color-bg); color: var(--color-text); -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--color-neutral-800); border-radius: 8px; }
@keyframes smRise { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes smDraw { from { stroke-dashoffset: 1400 } to { stroke-dashoffset: 0 } }
```

- [ ] **Step 3: Inter vía next/font y layout raíz en español**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Smart Money App',
  description: 'Diario de trading con mentoría',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

En `styles/nocturne.css` cambiar las dos definiciones de fuente a: `--font-heading: var(--font-inter), system-ui, sans-serif;` y `--font-body: var(--font-inter), system-ui, sans-serif;`.

- [ ] **Step 4: Página de prueba temporal** — reemplazar `app/page.tsx` con una tarjeta `.card` + `.btn btn-primary` + texto `text-neutral-400`; `npm run dev` y verificar en el navegador fondo #161826, Inter, botón delineado violeta.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: tokens y componentes Nocturne integrados con Tailwind v4`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Aprovisionar Vercel + Clerk + Neon + Blob

**Files:**
- Create: `.env.local` (vía `vercel env pull`, NO se commitea), `.vercel/` (link)

**Interfaces:**
- Produces: env vars reales: `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `BLOB_READ_WRITE_TOKEN`.

> ⚠️ Esta tarea tiene pasos de navegador. Si un comando pide autenticación o abre el dashboard, DETENTE y pide al usuario completarlo (puede ejecutar `! vercel login` en la sesión).

- [ ] **Step 1: Login y link**

Run: `vercel login` (si no hay sesión) y luego `vercel link` → crear proyecto nuevo `smart-money-app`.

- [ ] **Step 2: Integraciones marketplace**

```powershell
vercel integration add clerk
vercel integration add neon
```

Si alguna requiere "claim"/navegador: `vercel integration open clerk` y que el usuario termine allí.

- [ ] **Step 3: Blob store** — `vercel blob store add smart-money-captures` (o dashboard → Storage → Blob). Verificar con `vercel env ls` que existe `BLOB_READ_WRITE_TOKEN`.

- [ ] **Step 4: Configurar Clerk en su dashboard** (guiar al usuario):
  1. **User & Authentication → Email, Phone, Username**: activar Email + Password.
  2. **Social connections**: activar Google.
  3. **Restrictions → Sign-up mode: Restricted** (solo invitaciones — requisito de seguridad del spec).
  4. Español: en la app usaremos `@clerk/localizations` (`esES`), no requiere config en dashboard.

- [ ] **Step 5: Traer env vars y añadir las de rutas**

```powershell
vercel env pull .env.local --yes
```

Añadir a `.env.local` Y a Vercel (`vercel env add <NAME> production` + preview + development):

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

Verificar que `.gitignore` incluye `.env*` y `.vercel`. Commit solo si hubo cambios en archivos versionables.

---

### Task 4: Esquema Drizzle + migración

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/index.ts`, `drizzle.config.ts`

**Interfaces:**
- Produces: tablas `users`, `trades`, `trade_journals`, `trade_captures` en Neon; `getDb()` que devuelve el cliente Drizzle tipado con el schema; tipos `DbUser`, `DbTrade`, `DbJournal`, `DbCapture` (`typeof x.$inferSelect`).

- [ ] **Step 1: Instalar dependencias**

```powershell
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit dotenv-cli
```

- [ ] **Step 2: Escribir el schema**

```ts
// lib/db/schema.ts
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
```

- [ ] **Step 3: Cliente perezoso y config de drizzle-kit**

```ts
// lib/db/index.ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

function createDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle(sql, { schema })
}

let _db: ReturnType<typeof createDb> | null = null
export function getDb() {
  if (!_db) _db = createDb()
  return _db
}
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 4: Generar migración y aplicarla a Neon** (usamos `generate`+`migrate`, no `push`, porque los tests de la Task 8 aplican la misma carpeta `drizzle/` sobre PGlite en memoria)

Run: `npx dotenv -e .env.local -- npx drizzle-kit generate` → crea `drizzle/0000_*.sql`
Run: `npx dotenv -e .env.local -- npx drizzle-kit migrate`
Expected: tablas creadas. Verificar: `npx dotenv -e .env.local -- npx drizzle-kit studio` lista las 4 tablas (cerrar después).

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: esquema de base de datos (users, trades, journals, captures)`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Auth Clerk — middleware, páginas, sync de usuario y onboarding

**Files:**
- Create: `middleware.ts`, `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`, `app/(auth)/layout.tsx`, `lib/auth.ts`, `app/(app)/onboarding/page.tsx`, `lib/actions/onboarding.ts`, `lib/actions/types.ts`
- Modify: `app/layout.tsx` (ClerkProvider), `app/page.tsx` (redirect)

**Interfaces:**
- Consumes: `getDb()`, `users`, `DbUser` (Task 4).
- Produces: `requireUser(): Promise<DbUser>` — resuelve la sesión Clerk, sincroniza/crea la fila `users` y la devuelve; lanza `redirect('/sign-in')` sin sesión. `completeOnboarding(formData: FormData): Promise<ActionResult<null>>`. `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }` (en `lib/actions/types.ts`).

- [ ] **Step 1: Instalar y middleware**

```powershell
npm i @clerk/nextjs @clerk/localizations
```

```ts
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 2: Provider en español con apariencia Nocturne**

En `app/layout.tsx`, envolver `{children}` (dentro de `<body>`):

```tsx
import { ClerkProvider } from '@clerk/nextjs'
import { esES } from '@clerk/localizations'

// dentro del JSX:
<ClerkProvider
  localization={esES}
  appearance={{
    variables: {
      colorPrimary: '#9184d9',
      colorBackground: '#232532',
      colorText: '#e9e9ed',
      colorInputBackground: '#161826',
      colorInputText: '#e9e9ed',
      borderRadius: '8px',
    },
  }}
>
  {children}
</ClerkProvider>
```

- [ ] **Step 3: Páginas de acceso**

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-6">{children}</div>
}
```

```tsx
// app/(auth)/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'
export default function Page() { return <SignIn /> }
```

```tsx
// app/(auth)/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'
export default function Page() { return <SignUp /> }
```

- [ ] **Step 4: `requireUser` con sync**

```ts
// lib/auth.ts
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
```

- [ ] **Step 5: Onboarding (balance inicial)**

```ts
// lib/actions/types.ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
```

```ts
// lib/actions/onboarding.ts
'use server'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import type { ActionResult } from './types'

const schema = z.object({
  initialBalance: z.coerce.number().positive('Debe ser un monto positivo').max(100_000_000),
})

export async function completeOnboarding(formData: FormData): Promise<ActionResult<null>> {
  const user = await requireUser()
  const parsed = schema.safeParse({ initialBalance: formData.get('initialBalance') })
  if (!parsed.success) {
    return { ok: false, error: 'Revisa el monto', fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }
  const db = getDb()
  await db.update(users).set({ initialBalance: parsed.data.initialBalance }).where(eq(users.id, user.id))
  redirect('/dashboard')
}
```

`app/(app)/onboarding/page.tsx`: tarjeta `.card elev-md` centrada con título "Configura tu cuenta", campo `.field`+`.input` de balance inicial (`name="initialBalance"`, `type="number"`, `step="0.01"`) y `.btn btn-primary` "Comenzar" en un `<form action={completeOnboarding}>`. Si `user.initialBalance !== null`, `redirect('/dashboard')`.

`app/page.tsx`: server component → `const user = await requireUser()` y `redirect(user.initialBalance === null ? '/onboarding' : '/dashboard')`.

- [ ] **Step 6: Verificación manual** — `npm run dev`: visitar `/` sin sesión redirige a `/sign-in` (UI en español, colores Nocturne); crear una invitación de prueba en dashboard de Clerk → registrarse → aterriza en onboarding → guardar balance → `/dashboard` (404 por ahora, se crea en Task 10). Verificar en Drizzle Studio que la fila `users` existe con balance.

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: autenticacion Clerk por invitacion, sync de usuario y onboarding`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `lib/metrics` — motor de métricas (TDD)

**Files:**
- Create: `lib/metrics/types.ts`, `lib/metrics/summary.ts`, `lib/metrics/equity.ts`, `lib/metrics/periods.ts`, `lib/format.ts`
- Test: `lib/metrics/__tests__/summary.test.ts`, `lib/metrics/__tests__/equity.test.ts`, `lib/metrics/__tests__/periods.test.ts`
- Delete: `lib/metrics/__tests__/smoke.test.ts`

**Interfaces:**
- Produces:
  - `type TradePoint = { tradeDate: string; pnlUsd: number }` (subset estructural de `DbTrade` — acepta `DbTrade[]` directamente).
  - `computeSummary(trades: TradePoint[], initialBalance: number): Summary` con `Summary = { balance; netPnl; grossProfit; grossLoss; wins; losses; total; winRate: number|null; profitFactor: number|null; expectancy: number|null; avgWin: number|null; avgLoss: number|null; rbRatio: number|null; bestTrade: number|null; worstTrade: number|null }` (números en USD; ratios sin redondear — formatea la UI).
  - `equityPoints(trades: TradePoint[], initialBalance: number): { date: string; balance: number }[]` — ordenado por fecha ascendente (empates: orden de entrada), empieza con el balance inicial.
  - `buildLinePath(values: number[], width: number, height: number, pad?: number): { line: string; area: string }` — path SVG `M/L`, área cerrada hasta la base.
  - `calendarAggregates(trades: TradePoint[], year: number, month: number)` (month 1-12) → `{ days: Map<number, { pnl: number; count: number }>; summary: { net: number; daysTraded: number; positiveDays: number; bestDay: number|null } }`.
  - `monthlyAggregates(trades: TradePoint[], months: { year: number; month: number }[]): { label: string; net: number }[]` con labels `['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']`.
  - `lib/format.ts`: `money(n: number): string` (`$1,595`, negativos `-$180`), `signedMoney(n)` (`+$420` / `-$180`), `pct(n, digits?)`.

- [ ] **Step 1: Escribir los tests de `computeSummary`** — casos: (a) lista vacía → `total: 0`, ratios `null`, `balance === initialBalance`; (b) mezcla ganadoras/perdedoras (usar los 13 trades del mockup, líneas 563-577 de `_design/smart-money-app.dc.html`: grossProfit = 3040, grossLoss = 1045, net = +1995, winRate = 8/13 ≈ 61.5% → 62% redondeando en UI, profitFactor = 3040/1045); (c) solo ganadoras → `profitFactor: null` (sin pérdidas) y `avgLoss: null`; (d) solo perdedoras → `winRate: 0`, `avgWin: null`.

- [ ] **Step 2: `npx vitest run` → FAIL** (módulo no existe).

- [ ] **Step 3: Implementar `summary.ts`** — pura, sin fechas del sistema. `expectancy = netPnl / total`. `rbRatio = avgWin / avgLoss` solo si ambos existen.

- [ ] **Step 4: `npx vitest run` → PASS.**

- [ ] **Step 5: Tests de `equityPoints` + `buildLinePath`** — (a) curva empieza en `initialBalance`; (b) acumula en orden de fecha aunque la lista venga desordenada; (c) `buildLinePath([25000, 25420], 720, 220)` produce string que empieza con `M` y área que termina en `Z`; (d) un solo valor no divide por cero (línea horizontal).

- [ ] **Step 6: FAIL → implementar `equity.ts` → PASS.**

- [ ] **Step 7: Tests de `periods.ts`** — `calendarAggregates`: trades de 2 días distintos y otro mes ignorado; `positiveDays` cuenta días con suma > 0; `bestDay` es la mayor suma diaria (null sin trades). `monthlyAggregates`: devuelve un item por mes pedido aunque no haya trades (net 0), label correcto.

- [ ] **Step 8: FAIL → implementar `periods.ts` y `format.ts` → PASS.** Nota: parsear `tradeDate` con `split('-')` (nunca `new Date(str)` — evita el shift UTC).

- [ ] **Step 9: Commit**

```powershell
git add -A; git commit -m "feat: motor de metricas con TDD (summary, equity, periodos, formato)`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Validación Zod compartida

**Files:**
- Create: `lib/validation/trade.ts`, `lib/emotions.ts`
- Test: `lib/validation/__tests__/trade.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `lib/emotions.ts`: `export const EMOTIONS = ['Calma','Confianza','FOMO','Ansiedad','Impaciencia','Frustración','Enfoque'] as const`, `export const PHASES = ['antes','durante','despues'] as const`.
  - `tradeSchema` (Zod) → tipo `TradeFormValues`: `{ tradeDate: string(YYYY-MM-DD); asset: string(1-20, uppercase trim); market: enum; direction: 'long'|'short'; entryTime?: string(HH:mm)|null; exitTime?; entryPrice?: number|null; exitPrice?; contracts?; positionSize?; stopLoss?; takeProfit?; riskUsd?; riskPct?(0-100); pnlUsd: number; rMultiple?: number|null; setup: string(0-120); timeframe: string(0-20); marketConditions?; entryType?; confirmations? }`.
  - `journalSchema` → `{ whyTook, whatSaw, followedPlan, didWell, didWrong, improve: string(max 2000); emotions: { antes: string[], durante: string[], despues: string[] } }` con emociones restringidas a `EMOTIONS`.

- [ ] **Step 1: Tests** — (a) trade válido mínimo pasa (fecha, activo, mercado, dirección, pnlUsd); (b) `tradeDate: '2026-13-40'` falla; (c) `asset: ''` falla; (d) `riskPct: 150` falla; (e) journal con emoción fuera del vocabulario falla; (f) strings numéricos del form (`'420.50'`) se coercionan a número.

- [ ] **Step 2: FAIL → implementar → PASS.** Usar `z.coerce.number()` para numéricos y `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` + validación de fecha real para `tradeDate`.

- [ ] **Step 3: Commit**

```powershell
git add -A; git commit -m "feat: esquemas de validacion de trade y bitacora`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Queries de trades con autorización (TDD sobre PGlite) + Server Actions

**Files:**
- Create: `lib/db/queries/trades.ts`, `lib/actions/trades.ts`
- Test: `lib/db/queries/__tests__/trades.test.ts`, `lib/db/__tests__/helpers.ts`

**Interfaces:**
- Consumes: `getDb()`, schema (Task 4); `tradeSchema`, `journalSchema`, tipos `TradeFormValues`, `JournalFormValues` (Task 7); `requireUser` (Task 5); `ActionResult` (Task 5).
- Produces:
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>` (import de `drizzle-orm/pg-core`) — sirve para neon-http y PGlite.
  - `listTrades(db: Db, userId: string): Promise<DbTrade[]>` (orden `tradeDate` desc, `createdAt` desc).
  - `getTradeDetail(db: Db, userId: string, tradeId: string): Promise<{ trade: DbTrade; journal: DbJournal | null; captures: DbCapture[] } | null>`.
  - `insertTradeWithJournal(db: Db, userId: string, values: TradeFormValues, journal?: JournalFormValues): Promise<string>` — inserta trade y journal; si el journal falla, borra el trade insertado y relanza (compensación — el driver HTTP de Neon no tiene transacciones interactivas).
  - `updateTradeById(db, userId, tradeId, values: TradeFormValues): Promise<boolean>` (false si no existe o no es suyo).
  - `upsertJournal(db, userId, tradeId, journal: JournalFormValues): Promise<boolean>`.
  - `deleteTradeById(db, userId, tradeId): Promise<boolean>`.
  - Server Actions en `lib/actions/trades.ts` (`'use server'`): `createTrade(raw: unknown, journalRaw?: unknown): Promise<ActionResult<{ id: string }>>`, `updateTrade(tradeId: string, raw: unknown): Promise<ActionResult<null>>`, `saveJournal(tradeId: string, raw: unknown): Promise<ActionResult<null>>`, `removeTrade(tradeId: string): Promise<ActionResult<null>>`. Todas: `requireUser()` → validar con Zod (`safeParse`; error → `fieldErrors`) → query con `user.id` → `revalidatePath('/dashboard')` y `revalidatePath('/calendario')`.

- [ ] **Step 1: Helper de DB de test**

```powershell
npm i -D @electric-sql/pglite
```

```ts
// lib/db/__tests__/helpers.ts
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '../schema'

export async function createTestDb() {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: 'drizzle' })
  return db
}
```

- [ ] **Step 2: Tests de autorización y CRUD** — sembrar dos usuarios A y B (insert directo a `users`); casos: (a) `insertTradeWithJournal` crea trade+journal y `listTrades(db, A)` lo devuelve; (b) `listTrades(db, B)` NO devuelve trades de A; (c) `getTradeDetail(db, B, tradeDeA)` → `null`; (d) `updateTradeById(db, B, tradeDeA, ...)` → `false` y el trade queda intacto; (e) `deleteTradeById(db, B, tradeDeA)` → `false`; con A → `true` y desaparece con su journal (cascade); (f) `upsertJournal` crea si no existe y actualiza si existe.

- [ ] **Step 3: `npx vitest run` → FAIL** → implementar `lib/db/queries/trades.ts` (todas las cláusulas `where` combinan `eq(trades.id, tradeId)` **AND** `eq(trades.userId, userId)`; el update/delete usa `.returning()` y devuelve `result.length > 0`) → **PASS**.

- [ ] **Step 4: Server Actions** — implementar `lib/actions/trades.ts` según la interfaz de arriba. Sin tests unitarios propios (la lógica está en queries+Zod ya probados); verificación en Tasks 11-14.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: queries de trades con autorizacion probada y server actions`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Capturas — subida a Blob privado y descarga autenticada

**Files:**
- Create: `lib/actions/captures.ts`, `app/api/captures/[id]/route.ts`
- Modify: `lib/db/queries/trades.ts` (helper `getCaptureForUser`)

**Interfaces:**
- Consumes: `requireUser`, `getDb`, `getTradeDetail`, schema `tradeCaptures`.
- Produces:
  - `uploadCapture(tradeId: string, phase: 'before' | 'after', formData: FormData): Promise<ActionResult<{ captureId: string }>>` — archivo en campo `file`; valida dueño del trade, tipo (`image/png|jpeg|webp`) y tamaño (≤ 5 MB); sube a Blob `access: 'private'` en `captures/${tradeId}/${phase}` (con `allowOverwrite: true` para reemplazo); upsert en `trade_captures`.
  - `deleteCapture(captureId: string): Promise<ActionResult<null>>`.
  - `getCaptureForUser(db: Db, userId: string, captureId: string): Promise<DbCapture | null>` (join con `trades` filtrando `userId`).
  - `GET /api/captures/[id]` → 401 sin sesión, 404 si no es suya, si no: stream del blob con su `Content-Type` y `Cache-Control: private, max-age=60`.

- [ ] **Step 1: `npm i @vercel/blob`** e implementar `uploadCapture`/`deleteCapture` con las validaciones de arriba (rechazos → `{ ok: false, error }`).

- [ ] **Step 2: Route handler**

```ts
// app/api/captures/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { getCaptureForUser } from '@/lib/db/queries/trades'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const capture = await getCaptureForUser(getDb(), user.id, id)
  if (!capture) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  const blob = await get(capture.blobPathname)
  if (!blob) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return new NextResponse(blob.stream(), {
    headers: { 'Content-Type': capture.contentType, 'Cache-Control': 'private, max-age=60' },
  })
}
```

(Ajustar a la API real de `@vercel/blob` instalada: si `get()` devuelve `{ statusCode, body }`, adaptar; consultar el README del paquete instalado en `node_modules/@vercel/blob`.)

- [ ] **Step 3: Verificación** — se prueba end-to-end en Task 14 (UI de capturas). Aquí: `npm run build` pasa.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat: subida y descarga autenticada de capturas en Blob privado`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Shell responsive — sidebar, header y nav inferior

**Files:**
- Create: `app/(app)/layout.tsx`, `components/shell/Sidebar.tsx`, `components/shell/BottomNav.tsx`, `components/shell/PageHeader.tsx`, `components/shell/Brand.tsx`

**Interfaces:**
- Consumes: `requireUser` (Task 5), tokens Nocturne (Task 2).
- Produces: shell con `<Sidebar/>` (desktop ≥1024px) y `<BottomNav/>` (<1024px); `PageHeader({ title, subtitle, children? })` — `children` = acciones a la derecha. Nav Fase 1: Dashboard (`/dashboard`), Calendario (`/calendario`).

**Referencia visual:** mockup líneas 27-86 (sidebar/header). Marca: cuadro 26px borde acento con rombo interior + "Smart Money / APP" (líneas 28-36).

- [ ] **Step 1: `npm i @phosphor-icons/react`.** Iconos: `ChartLineUp` (Dashboard), `CalendarBlank` (Calendario), `Plus` (registrar).

- [ ] **Step 2: Layout del grupo `(app)`** — server component: `const user = await requireUser()`; si `user.initialBalance === null` y la ruta no es onboarding → `redirect('/onboarding')` (mover onboarding FUERA del grupo si genera bucle: dejar `app/onboarding/page.tsx` suelto). Estructura: `<div className="flex min-h-screen"><Sidebar user={...}/><main className="flex-1 min-w-0 flex flex-col pb-16 lg:pb-0">{children}</main><BottomNav/></div>`.

- [ ] **Step 3: Sidebar** (client, `usePathname`): `hidden lg:flex` ancho 236px, sticky, borde derecho `border-neutral-800`; items con estado activo = fondo `--color-accent-900`, texto `--color-accent-200`, `box-shadow: inset 2px 0 0 var(--color-accent)` (línea 603 del mockup); abajo chip de usuario: iniciales + nombre + `<UserButton/>` de Clerk.

- [ ] **Step 4: BottomNav** (client): `fixed bottom-0 inset-x-0 lg:hidden`, fondo `--color-bg` con borde superior `--color-neutral-800`, 4 items: Dashboard, botón central "+" (`.btn btn-primary btn-icon` → navega a `/calendario?nuevo=1`), Calendario, avatar (UserButton). Altura 56px + safe-area (`pb-[env(safe-area-inset-bottom)]`).

- [ ] **Step 5: PageHeader** — sticky top-0, blur y degradado como el mockup (línea 68), título 19px `--font-heading`, subtítulo 12px `--color-neutral-400`, acciones a la derecha (`ml-auto`).

- [ ] **Step 6: Verificar en `npm run dev`** con DevTools responsive: 1440px (sidebar), 390px (nav inferior). Commit:

```powershell
git add -A; git commit -m "feat: shell responsive con sidebar, header y nav inferior`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Dashboard

**Files:**
- Create: `app/(app)/dashboard/page.tsx`, `components/dashboard/HeroStats.tsx`, `components/dashboard/EquityCurve.tsx`, `components/dashboard/WinRateDonut.tsx`, `components/dashboard/QualityStats.tsx`, `components/dashboard/MonthlyBars.tsx`, `components/dashboard/RecentTrades.tsx`

**Interfaces:**
- Consumes: `requireUser`, `getDb`, `listTrades` (Task 8), `computeSummary`/`equityPoints`/`buildLinePath`/`monthlyAggregates` (Task 6), `money`/`signedMoney` (Task 6), `PageHeader` (Task 10).
- Produces: página `/dashboard` completa. Todos los componentes reciben datos ya calculados por props (server components salvo donde se indique).

**Referencia visual:** mockup líneas 90-190 (layout exacto de grids y tarjetas) y líneas 619-666 (lógica de curva/donut/barras que replican los componentes).

- [ ] **Step 1: Página** — server component: cargar trades, `summary = computeSummary(trades, user.initialBalance!)`; grid hero `repeat(auto-fit,minmax(190px,1fr))` con 4 tarjetas: Balance actual (`money(summary.balance)`), P&L acumulado (`signedMoney(summary.netPnl)` en `--pos`/`--neg` + % sobre cuenta), Profit Factor (o `'—'` si null), Expectancy (`$X / trade` + total de operaciones). Segunda fila grid `2.1fr 1fr`: EquityCurve | (WinRateDonut + QualityStats). Tercera: `1fr 1.35fr`: MonthlyBars | RecentTrades. En móvil todo apila (`grid-cols-1` por defecto, las plantillas de columnas solo desde `lg:`).

- [ ] **Step 2: EquityCurve** — server component con SVG `viewBox="0 0 720 220"`, 4 gridlines `--color-neutral-800`, área con `linearGradient` del acento (0.28→0), línea `--color-accent` 2px con animación `smDraw` (mockup 109-124). Usa `buildLinePath(equityPoints(...).map(p => p.balance), 720, 220)`. Ticks de fecha abajo: primera, media y última fecha del rango (últimos 30 días).

- [ ] **Step 3: WinRateDonut + QualityStats** — donut: dos `<circle r="42">` con `stroke-dasharray="${(winRate/100)*264} 264"` rotado -90° (mockup 130-138); al lado el % y "X ganadoras · Y perdedoras". QualityStats: lista label/valor (Ratio R:B, Promedio de ganancia en `--pos`, Promedio de pérdida en `--neg`, Mejor/Peor trade) — valores null → `'—'`.

- [ ] **Step 4: MonthlyBars** — últimos 8 meses (`monthlyAggregates` con los meses calculados desde la fecha actual); barras verticales altura proporcional al `|net|` máximo (mín. 6px), positivas con degradado del acento, negativas con `--neg` (mockup 154-162, 652-657).

- [ ] **Step 5: RecentTrades** — tabla `.table` con últimas 6 operaciones: Activo, Dir. (chip Long/Short con borde `--pos`/`--neg` — mockup 664), Setup, R, P&L (tabular-nums, color por signo). Cada fila es `<Link href={`/dashboard?trade=${id}`}>` por celda o `onClick` en client wrapper → abre el modal (Task 13). Botón "Ver calendario" → `/calendario`. En móvil la tabla va dentro de `overflow-x-auto`.

- [ ] **Step 6: Estado vacío** — sin trades: tarjeta centrada "Aún no registras operaciones" + `.btn btn-primary` "Registrar mi primera operación" → `/calendario?nuevo=1`.

- [ ] **Step 7: Verificar con datos de prueba** (insertar 3-4 trades vía Drizzle Studio o script seed con `npx dotenv -e .env.local -- npx tsx scripts/seed.ts` usando los trades del mockup). Commit:

```powershell
git add -A; git commit -m "feat: dashboard con metricas, curva, donut, barras y ultimas operaciones`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Calendario

**Files:**
- Create: `app/(app)/calendario/page.tsx`, `components/calendar/MonthGrid.tsx`, `components/calendar/MonthSummary.tsx`

**Interfaces:**
- Consumes: `listTrades`, `calendarAggregates`, `money`/`signedMoney`, `PageHeader`.
- Produces: página `/calendario?y=2026&m=8` (defaults: mes actual). Celdas-día enlazan a `?y=&m=&trade=<id>` (día con trades → su primer trade) o `?y=&m=&nuevo=1&fecha=YYYY-MM-DD` (día vacío).

**Referencia visual:** mockup líneas 216-251 (cabecera de mes, leyenda, grid 7 columnas, resumen) y 668-697 (lógica de celdas).

- [ ] **Step 1: Página** — leer `searchParams` (`y`, `m` numéricos válidos o mes actual); flechas ‹ › son `<Link>` a mes anterior/siguiente; leyenda de colores (Día positivo/negativo/Sin operativa). `calendarAggregates(trades, y, m)` para celdas y resumen.

- [ ] **Step 2: MonthGrid** — cabecera Lun-Dom; offset del primer día `(getDay + 6) % 7` construyendo la fecha con `new Date(y, m-1, 1)` (constructor numérico, sin parsing de string); celdas: día con trades → tinte `color-mix(in oklab, var(--pos|--neg) 12%, transparent)` y borde 40% (mockup 681-688), P&L 15px y "N trades"; sin trades → borde `--color-neutral-800`. Hover: borde acento + `translateY(-1px)`. Móvil (<640px): celdas `min-h-[52px]`, P&L abreviado (`+$640` → `+640`), ocultar contador.

- [ ] **Step 3: MonthSummary** — 4 tarjetas: Resultado del mes, Días operados, Días positivos ("X de Y"), Mejor día (mockup 692-697).

- [ ] **Step 4: Verificar navegación de meses y colores con los datos seed; probar 390px.** Commit:

```powershell
git add -A; git commit -m "feat: calendario mensual con P&L diario y resumen`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Modal de operación — estructura, wizard y pasos Datos/Riesgo/Estrategia

**Files:**
- Create: `components/trade-modal/TradeModal.tsx` (client), `components/trade-modal/TradeModalGate.tsx` (server), `components/trade-modal/fields.tsx` (inputs reutilizables), `components/trade-modal/steps.ts` (constantes)
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/calendario/page.tsx` (renderizar el Gate con sus searchParams)

**Interfaces:**
- Consumes: `getTradeDetail` (Task 8), actions `createTrade`/`updateTrade`/`removeTrade` (Task 8), `tradeSchema` (Task 7), tokens Nocturne.
- Produces:
  - `TradeModalGate({ searchParams, userId })` — server: si `searchParams.trade` → carga detalle (con su DB) y renderiza `<TradeModal mode="edit" detail={...}/>`; si `searchParams.nuevo` → `<TradeModal mode="create" defaultDate={searchParams.fecha ?? hoy}/>`; si nada → null.
  - `TradeModal({ mode, detail?, defaultDate? })` — client. **Crear** = wizard 4 pasos: `['Datos', 'Riesgo y resultado', 'Estrategia', 'Bitácora']`; **editar** = 2 pestañas (Datos+Riesgo+Estrategia | Bitácora), como decidió el spec. Cerrar = quitar los query params con `router.replace(pathname)`.

**Referencia visual:** mockup líneas 408-546 (estructura completa del modal: header con título/fecha, stepper 427-433, secciones de campos 437-484, footer 532-543).

- [ ] **Step 1: Gate + apertura/cierre** — backdrop `.dialog-backdrop` con blur, click fuera cierra, `Escape` cierra, contenedor `width:min(940px,100%)` desktop; móvil (<640px): `fixed inset-0` a pantalla completa con header propio y scroll interno. Animación `smRise`.

- [ ] **Step 2: Paso/sección Datos** (mockup 437-455) — grid `repeat(auto-fit,minmax(150px,1fr))`: Activo (text, uppercase), Mercado (`<select>` con las 6 opciones del enum, labels: Índices, Acciones, Opciones, Futuros, Forex, Cripto), Fecha (date), Hora entrada/salida (time), Precio entrada/salida, Contratos, Tamaño de posición, y segmentado **Long/Short** (verde/rojo como mockup 448-453, lógica 896-897).

- [ ] **Step 3: Paso/sección Riesgo y resultado** (457-470) — Stop Loss, Take Profit, Riesgo $, Riesgo %, **P&L $ (requerido)**, R múltiple. Autocálculo suave: si hay riesgo $ y P&L, sugerir `R = pnl / riesgo` (editable).

- [ ] **Step 4: Paso/sección Estrategia** (472-484) — Setup, Temporalidad (select: 1m/5m/15m/1h/4h/D), Condiciones del mercado, Tipo de entrada, Confirmaciones.

- [ ] **Step 5: Validación y guardado** — estado del form en un solo objeto; al enviar: `createTrade(values, journalValues)` o `updateTrade(id, values)`; `fieldErrors` se pintan bajo cada campo en `--neg` 11px; botón "Continuar" (`.btn btn-primary`) avanza paso validando los campos del paso actual con `tradeSchema.pick(...)`; footer: Cancelar + Continuar/Guardar operación (mockup 532-543). Deshabilitar submit mientras `isPending` (`useTransition`).

- [ ] **Step 6: Verificar flujo completo crear+editar desde dashboard y calendario, desktop y móvil.** Commit:

```powershell
git add -A; git commit -m "feat: modal de operacion con asistente por pasos y edicion en pestañas`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Bitácora — journaling, emociones, capturas y autoguardado

**Files:**
- Create: `components/trade-modal/JournalSection.tsx`, `components/trade-modal/EmotionPicker.tsx`, `components/trade-modal/CaptureSlot.tsx`
- Modify: `components/trade-modal/TradeModal.tsx` (integrar como paso 4 / pestaña 2)

**Interfaces:**
- Consumes: `saveJournal`, `uploadCapture`, `deleteCapture` (Tasks 8-9), `EMOTIONS`/`PHASES` (Task 7), `journalSchema`.
- Produces: `JournalSection({ tradeId?, initial, onChange })` — en modo crear (`tradeId` undefined) solo levanta estado vía `onChange` (se guarda junto al trade al finalizar el wizard); en modo editar autoguarda con debounce 800ms llamando `saveJournal` y muestra "Guardado ✓" / "Guardando…" (nota del mockup: "Se guarda automáticamente mientras escribes", línea 849).

**Referencia visual:** mockup líneas 486-521 (preguntas, emociones, zonas de captura) y 579 (vocabulario), 715-728 (toggle de emociones).

- [ ] **Step 1: Preguntas** — 6 `<textarea rows=3>` en grid `minmax(260px,1fr)` con los labels EXACTOS del mockup (884-889): "¿Por qué tomaste la operación?", "¿Qué viste en el mercado?", "¿Seguiste tu plan?", "¿Qué hiciste bien?", "¿Qué hiciste mal?", "¿Qué puedes mejorar?". Nota bajo el título: "Lo que escribas aquí es lo que tu mentor va a leer".

- [ ] **Step 2: EmotionPicker** — 3 filas (Antes/Durante/Después) de chips toggle con las 7 emociones; activo = borde+fondo acento (mockup 715-728). Accesible: `<button aria-pressed>`.

- [ ] **Step 3: CaptureSlot** — 2 zonas ("Antes de la operación"/"Después de la operación", mockup 513-520): borde punteado, drag&drop + `<input type="file" accept="image/png,image/jpeg,image/webp">`; al soltar en modo editar sube con `uploadCapture` (`useTransition`, preview optimista con `URL.createObjectURL`) y al cargar muestra `<img src={`/api/captures/${id}`}>` con botón eliminar; en modo crear guarda los `File` en estado y los sube tras `createTrade` con el id devuelto. Errores (tipo/tamaño) en `--neg`.

- [ ] **Step 4: Autoguardado** — hook `useDebouncedCallback` propio (setTimeout + cleanup, 800ms) sobre el estado del journal en modo editar; indicador de estado junto al título.

- [ ] **Step 5: Verificar E2E**: crear trade completo con bitácora+emociones+2 capturas; recargar; editar texto y ver "Guardado"; abrir la captura por URL directa en ventana de incógnito → redirige a sign-in (privacidad verificada). Commit:

```powershell
git add -A; git commit -m "feat: bitacora con emociones, capturas privadas y autoguardado`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Endurecimiento — cabeceras, errores y estados vacíos

**Files:**
- Modify: `next.config.ts`
- Create: `app/(app)/error.tsx`, `app/not-found.tsx`, `app/(app)/dashboard/loading.tsx`, `app/(app)/calendario/loading.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: cabeceras de seguridad globales; error boundaries con reintento; skeletons de carga.

- [ ] **Step 1: Cabeceras en `next.config.ts`**

```ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
export default nextConfig
```

CSP: añadir header `Content-Security-Policy` con `default-src 'self'`, `script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com`, `connect-src 'self' https://*.clerk.accounts.dev`, `img-src 'self' blob: data: https://img.clerk.com`, `style-src 'self' 'unsafe-inline'`, `frame-src https://challenges.cloudflare.com`, `worker-src 'self' blob:`. **Probar login/Google después de activarla** — si Clerk usa dominio propio de producción, añadirlo. Si algo rompe en dev, aplicar CSP solo en producción (`process.env.NODE_ENV === 'production'`).

- [ ] **Step 2: `error.tsx`** — client component: tarjeta "Algo salió mal" + `.btn btn-secondary` "Reintentar" (`reset()`). `not-found.tsx`: "Página no encontrada" + link a `/dashboard`.

- [ ] **Step 3: Skeletons** — `loading.tsx` con tarjetas `.card` en pulso (`animate-pulse`) imitando la grilla de cada página.

- [ ] **Step 4: `npm run build` limpio + revisión con DevTools (Network → headers presentes).** Commit:

```powershell
git add -A; git commit -m "feat: cabeceras de seguridad, error boundaries y skeletons`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Despliegue y smoke test de aceptación

**Files:**
- Ninguno nuevo (config en Vercel).

- [ ] **Step 1: Preview** — `vercel deploy`; abrir la URL y verificar login (correo y Google), onboarding y dashboard.

- [ ] **Step 2: Checklist de aceptación del spec** (marcar cada uno en el preview):
  1. Sin sesión, cualquier URL redirige a sign-in (probar `/dashboard`, `/api/captures/xxx`).
  2. Test de autorización de Task 8 en verde (`npx vitest run`).
  3. Registrar operación completa con bitácora, emociones y capturas desde escritorio Y móvil real (o emulado 390px).
  4. Métricas del dashboard cuadran con los trades registrados (verificar Profit Factor a mano con 2-3 trades).
  5. Fidelidad visual contra `_design/smart-money-app.dc.html` abierto en navegador a 1440px; revisar 768px y 390px.
  6. Login Google y correo+contraseña funcionan en el dominio de Vercel (añadir el dominio en Clerk si Google falla por redirect URI).

- [ ] **Step 3: Producción** — `vercel deploy --prod` (o `vercel promote`). Verificar una vez más login + registrar un trade.

- [ ] **Step 4: Commit final de cualquier ajuste + tag**

```powershell
git add -A; git commit -m "chore: ajustes de despliegue Fase 1`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"; git tag fase-1
```

---

## Notas de self-review del plan

- **Cobertura del spec:** auth por invitación (T3/T5), onboarding (T5), dashboard completo (T11), calendario (T12), registro por pasos + edición en pestañas (T13), bitácora/emociones/capturas/autoguardado (T14), seguridad (T3.4, T8 autorización probada, T9 blob privado, T15 cabeceras), responsive (T10-T14), testing métricas TDD (T6-T7), criterios de aceptación (T16). Fase 2 intencionalmente ausente (spec §2).
- **Desviación documentada:** el spec menciona "batch del driver de Neon" para trade+journal; el plan usa inserción secuencial con compensación (T8) para que las mismas queries corran en PGlite en tests — misma garantía práctica, actualizar el spec si se desea.
- **Tipos consistentes:** `ActionResult` (T5) usado por T8/T9; `TradePoint` estructural acepta `DbTrade[]`; `Db` (T8) sirve a queries y tests.

