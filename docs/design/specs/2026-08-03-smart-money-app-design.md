# Smart Money App — Diseño técnico

**Fecha:** 2026-08-03
**Estado:** Aprobado por el usuario (Fase 1)
**Diseño visual de referencia:** Proyecto de Claude Design `65bf9671-58e8-4e7d-9093-bdc799158942` (`Smart Money App.dc.html`), copia local en `_design/smart-money-app.dc.html`. Design system: **Nocturne** (`_ds/nocturne-.../styles.css` + `readme.md`).

## 1. Qué es

Diario de trading para un programa de mentoría con un mentor y sus estudiantes. El estudiante registra cada operación con datos técnicos, gestión de riesgo, información estratégica y bitácora emocional; la app calcula sus métricas (Win Rate, Profit Factor, Expectancy, curva de crecimiento) y las presenta en dashboard y calendario. El mentor (Fase 2) supervisa al grupo, compara estudiantes, asigna objetivos/niveles y deja retroalimentación por operación.

Requisitos transversales del usuario: **app web segura, responsive y muy profesional**. Idioma de la UI: **español**. Moneda: USD.

## 2. Alcance

### Fase 1 (este spec — se construye ahora)
- Autenticación: correo+contraseña y Google (Clerk). Registro de estudiantes **solo por invitación** del mentor.
- Onboarding mínimo: capturar balance inicial de la cuenta.
- Dashboard del estudiante: 4 tarjetas hero (Balance, P&L acumulado, Profit Factor, Expectancy), curva de crecimiento (30 días), dona de Win Rate + estadísticas de calidad, barras de rendimiento mensual, tabla de últimas operaciones.
- Calendario mensual: celdas con P&L y nº de trades por día, navegación de meses, resumen del mes (resultado, días operados, días positivos, mejor día). Click en día → ver/registrar operación.
- Registro de operación (modal/hoja): **nuevo = asistente por pasos** (Datos → Riesgo y resultado → Estrategia → Bitácora); **ver/editar = pestañas**. Incluye bitácora de 6 preguntas, emociones antes/durante/después y 2 capturas de gráfico (antes/después).
- Responsive completo (sidebar → nav inferior en móvil; modal → hoja a pantalla completa).

### Fase 2 (diseñada en el modelo de datos, NO se construye ahora)
- Rol mentor: panel general con ranking, dashboard/calendario por alumno, comparador de métricas, gestión de objetivos y niveles, retroalimentación por trade → centro de notificaciones del estudiante, badge de no-leídas.
- Sistema de niveles 1–5 con requisitos (ganancia acumulada, Profit Factor mínimo, nº de operaciones, drawdown máximo).

### Fuera de alcance (ambas fases)
- Integración con brokers (todo el registro es manual).
- Multi-mentor / multi-tenant.
- Tiempo real (websockets); las notificaciones se cargan al navegar.

## 3. Decisiones tomadas

| Decisión | Elección |
| --- | --- |
| Modelo de usuarios | Un mentor con sus estudiantes; alta por invitación por correo |
| Login | Correo+contraseña y Google, vía Clerk |
| Alcance inicial | Núcleo del estudiante primero; mentor en Fase 2 |
| Stack | Next.js (App Router, TS) en Vercel + Clerk + Neon Postgres (Drizzle) + Vercel Blob |

## 4. Arquitectura

- **Next.js App Router + TypeScript**, desplegado en Vercel (Fluid Compute, runtime Node.js).
- **Lecturas**: Server Components consultan la base directamente (sin API pública intermedia).
- **Escrituras**: Server Actions con validación Zod; `revalidatePath` tras cada mutación.
- **Auth**: `clerkMiddleware` protege todo excepto `/sign-in`, `/sign-up` (por invitación) y estáticos.
- **Almacenamiento de archivos**: Vercel Blob con `access: 'private'`; las capturas se sirven por una route handler autenticada que verifica propiedad.
- **Proveedores** (marketplace de Vercel, env vars autoprovisionadas): Clerk, Neon. Blob es nativo de Vercel.

### Estructura del proyecto

```
app/
  (auth)/sign-in/[[...sign-in]]/page.tsx
  (auth)/sign-up/[[...sign-up]]/page.tsx
  (app)/layout.tsx          ← shell: sidebar/nav inferior + header
  (app)/dashboard/page.tsx
  (app)/calendario/page.tsx
  (app)/onboarding/page.tsx
  api/captures/[id]/route.ts  ← sirve capturas privadas autenticadas
lib/
  db/schema.ts, index.ts, queries/
  metrics/                  ← funciones puras de cálculo (TDD)
  actions/                  ← Server Actions (trades, journal, captures)
  validation/               ← esquemas Zod compartidos
components/
  ui/                       ← primitivas Nocturne (Card, Button, Tag, Dialog…)
  charts/                   ← EquityCurve, WinRateDonut, MonthlyBars (SVG propio)
  trade-modal/              ← asistente por pasos + pestañas
styles/nocturne.css         ← tokens del design system
```

## 5. Modelo de datos (Drizzle / Postgres)

- **`users`** — `id` (uuid), `clerk_id` (unique), `role` (`student`|`mentor`), `name`, `initial_balance` (numeric), `created_at`. El rol se lee SIEMPRE de esta tabla en el servidor, nunca del cliente.
- **`trades`** — `id`, `user_id` → users, `trade_date` (date), `asset` (text), `market` (enum: `indices`|`acciones`|`opciones`|`futuros`|`forex`|`cripto`), `direction` (`long`|`short`), `entry_time`/`exit_time` (time, opcionales), `entry_price`/`exit_price` (numeric), `contracts` (numeric), `position_size` (numeric), `stop_loss`/`take_profit` (numeric, opcionales), `risk_usd`/`risk_pct` (numeric, opcionales), `pnl_usd` (numeric, requerido), `r_multiple` (numeric, opcional), `setup` (text), `timeframe` (text), `market_conditions`/`entry_type`/`confirmations` (text, opcionales), `created_at`, `updated_at`. Índices: `(user_id, trade_date)`.
- **`trade_journals`** — `trade_id` (pk/fk), 6 columnas text (`why_took`, `what_saw`, `followed_plan`, `did_well`, `did_wrong`, `improve`), `emotions` (jsonb `{antes:[],durante:[],despues:[]}` con vocabulario fijo: Calma, Confianza, FOMO, Ansiedad, Impaciencia, Frustración, Enfoque), `updated_at`.
- **`trade_captures`** — `id`, `trade_id` → trades, `phase` (`before`|`after`), `blob_pathname`, `content_type`, `created_at`. Máximo 1 por fase y trade (unique `(trade_id, phase)`).

### Fase 2 (migraciones futuras, no se crean ahora)
`goals` (user_id, nombre, descripción, tipo de métrica, valor objetivo, fecha límite, estado), `levels` (definición 1–5 con requisitos), `user_levels` (progreso), `notifications` (user_id, autor, tipo, título, cuerpo, trade_id opcional, leída_en).

### Métricas derivadas (nunca almacenadas)
`lib/metrics` calcula a partir de la lista de trades: balance actual, P&L neto/bruto, Win Rate, Profit Factor, Expectancy, promedio de ganancia/pérdida, ratio R:B, mejor/peor trade, curva de equidad (puntos SVG), agregados por día (calendario) y por mes (barras). Funciones puras, probadas con Vitest.

## 6. Seguridad

1. **Credenciales**: delegadas 100% a Clerk (hashing, verificación de correo, recuperación, protección de fuerza bruta, OAuth Google). Nosotros no almacenamos ni transportamos contraseñas.
2. **Sesión**: cookies httpOnly de Clerk; middleware exige sesión en toda la app.
3. **Autorización**: toda query y Server Action resuelve `userId` del servidor (`await auth()`) y filtra por él. Regla: *ninguna función acepta un `userId` que venga del cliente*. Fase 2: comprobación de rol `mentor` en servidor para rutas de supervisión.
4. **Validación**: esquemas Zod en `lib/validation` usados por las Server Actions (fuente de verdad) y reutilizados en los formularios para UX.
5. **Archivos**: Blob privado; subida vía Server Action con límite de tamaño (5 MB) y tipos permitidos (png/jpg/webp); descarga vía `api/captures/[id]` que verifica que el trade pertenece al usuario.
6. **Cabeceras**: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` en `next.config`.
7. **Invitaciones**: el registro público queda cerrado; solo se crean cuentas desde invitaciones de Clerk emitidas por el mentor (en Fase 1 las emite el operador desde el dashboard de Clerk; en Fase 2, desde la propia app).
8. **Secretos**: solo en variables de entorno de Vercel; nada sensible en el cliente.

## 7. UI, design system y responsive

- **Nocturne se respeta al pie de la letra**: tokens (`--color-*`, ramps 100–900 OKLCH, `--font-*` Inter, `--space-*`, `--radius-*`, `--shadow-*`) importados a `styles/nocturne.css` y mapeados a Tailwind v4 con `@theme`. Reglas clave: acento #9184d9 como línea/brillo (nunca relleno masivo), botones delineados, `:focus-visible` con anillo de acento, estados hover/pressed desde las ramps, densidad compacta 0.7×, positivo `oklch(0.76 0.11 162)` / negativo `oklch(0.68 0.15 22)`.
- **Iconos**: Phosphor Icons.
- **Gráficas**: componentes SVG propios (curva con área degradada y animación de trazo, dona de Win Rate, barras mensuales) — fieles al mockup, sin librería de charts.
- **Breakpoints**: escritorio ≥1024px = sidebar 236px fija; tablet 640–1024 = sidebar colapsada a iconos; móvil <640 = nav inferior fija (Dashboard, Calendario, + Registrar, Notificaciones, Perfil), tarjetas a una columna, tablas con scroll horizontal dentro de su tarjeta, calendario con celdas compactas (día + P&L abreviado), modal de trade como hoja a pantalla completa.
- **Accesibilidad**: contraste según las reglas de Nocturne (texto acento en `--color-accent-300`), navegación por teclado completa en el asistente y el calendario, `aria-label` en iconografía.

## 8. Flujos principales

1. **Alta**: invitación por correo → sign-up de Clerk (correo+contraseña o Google) → en el primer acceso, el layout autenticado sincroniza la fila en `users` si no existe (sin webhooks) → onboarding pide balance inicial → dashboard.
2. **Registrar trade**: botón "+ Registrar trade" (header/nav) o click en día del calendario → asistente por pasos → al finalizar, una Server Action crea `trades` + `trade_journals` en una operación atómica (batch del driver de Neon) → revalida dashboard/calendario.
3. **Editar/ver trade**: click en fila o día → modal en pestañas; la bitácora se **autoguarda** con debounce (~800 ms) vía Server Action; indicador "Guardado".
4. **Capturas**: subida desde el paso Bitácora (drag & drop o selector); se suben al guardar; reemplazables.

## 9. Manejo de errores

- `error.tsx` por grupo de rutas con mensaje amable y reintento; `not-found.tsx` global.
- Server Actions devuelven `{ ok, error }` tipado; el cliente muestra toast (fallo general) o errores de campo (validación).
- Fallos de subida de captura no bloquean el guardado del trade (se reporta y se puede reintentar).
- Estados vacíos diseñados (sin trades aún: guía para registrar el primero).

## 10. Testing

- **Vitest** (TDD) para `lib/metrics` y `lib/validation`: profit factor, expectancy, R, win rate, curva, agregados de calendario/mes, casos borde (0 trades, todo pérdidas, división por cero).
- Tests de Server Actions con mocks de auth y DB en memoria donde aporten valor (autorización: usuario A no toca datos de B).
- Smoke test manual guiado del flujo completo antes de desplegar (login → registrar → dashboard → calendario → editar → captura).

## 11. Criterios de aceptación de la Fase 1

- [ ] Imposible acceder a ninguna pantalla o dato sin sesión.
- [ ] Un usuario jamás puede leer/modificar trades de otro (verificado por test).
- [ ] Registrar una operación completa (con bitácora, emociones y capturas) desde escritorio y desde móvil.
- [ ] Dashboard y calendario reflejan las métricas correctas calculadas desde los trades reales.
- [ ] UI fiel a Nocturne y al mockup en 1440px, 768px y 390px.
- [ ] Login con Google y con correo+contraseña funcionando en producción (Vercel).
