# Smart Trader Performance System

Diario de trading con mentoría: un mentor invita a sus estudiantes, revisa sus
operaciones y bitácoras, les deja retroalimentación, les asigna objetivos y
administra su progreso por niveles.

**Producción**: https://smart-money-app-two.vercel.app

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind v4
- **Clerk** — autenticación (registro solo por invitación, email+contraseña y Google)
- **Neon** (Postgres serverless) + **Drizzle ORM** — datos y migraciones (`drizzle/`)
- **Vercel Blob** (privado) — capturas de gráficos
- **Vitest + PGlite** — 294 tests (métricas puras + matriz de autorización sobre Postgres embebido)
- Design system propio **Nocturne** (`styles/nocturne.css`, tokens; tema claro/oscuro esmeralda)

## Desarrollo

```bash
npm install
npm run dev        # requiere .env.local (Clerk, Neon, Blob, MENTOR_EMAIL, APP_URL)
npm test           # suite completa (serial por PGlite)
npm run db:migrate # aplica migraciones a la base de .env.local
```

## Flujo de trabajo

- Rama nueva por mejora → push → **Preview Deployment** automático en Vercel (URL propia para probar).
- Merge a `master` → **despliegue a producción** automático.
- Tags `fase-1` y `fase-2` marcan los hitos entregados.

## Notas de arquitectura

- Las métricas (resumen, curva de equidad, drawdown, niveles, objetivos) son
  **siempre derivadas** de los trades — nunca se almacenan (`lib/metrics/`).
- Autorización en doble capa: `requireUser`/`requireMentor` en actions y
  re-verificación de rol/propiedad **dentro** de cada query (`lib/db/queries/`).
- Zona horaria del programa: UTC-6 (`lib/app-time.ts`) — todo cálculo de
  calendario del lado servidor se ancla ahí, nunca a la hora del proceso.
- `styles/nocturne.css` va deliberadamente sin `@layer` (ver su cabecera).
