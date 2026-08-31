# Smart Money App — Fase 2: Rol Mentor — Diseño técnico

**Fecha:** 2026-08-04
**Estado:** Aprobado por el usuario
**Base:** Fase 1 completa en `master` (tag `fase-1`), en producción. Spec de Fase 1: `2026-08-03-smart-money-app-design.md`. Mockup: `_design/smart-money-app.dc.html` (pantallas mentor: líneas 346-403 panel/comparador, 254-344 notificaciones/objetivos/niveles del estudiante, 524-529 feedback en modal).

## 1. Qué es

El mentor supervisa a todos los estudiantes del programa: panel general con ranking, acceso de lectura a los dashboards y calendarios de cada alumno, comparador de métricas, asignación de objetivos, gestión de los niveles del programa, retroalimentación por operación (llega al centro de notificaciones del estudiante) e invitaciones por correo desde la app. El estudiante gana tres pantallas: Notificaciones (con badge de no leídas), Objetivos (lectura) y Mi nivel.

## 2. Decisiones tomadas

| Decisión | Elección |
| --- | --- |
| Alcance | Fase 2 completa en un solo plan |
| Designación del mentor | `MENTOR_EMAIL` en Vercel (= `raulbenitez1606@gmail.com`); promoción automática al iniciar sesión |
| Niveles | 5 precargados del mockup, editables por el mentor desde la app |
| Invitaciones | Desde la app (API backend de Clerk); el mentor no usa el dashboard de Clerk |
| Vistas por alumno | Reutilizar páginas existentes vía `/estudiantes/[id]/...` — cero duplicación |

## 3. Acceso y autorización

1. **Promoción**: en `requireUser`, si el correo primario de Clerk coincide con `MENTOR_EMAIL` (case-insensitive) y el rol es `student`, se actualiza a `mentor`. Sin endpoints; sin lista de mentores múltiples (modelo de un mentor de Fase 1).
2. **`requireMentor(): Promise<DbUser>`** en `lib/auth.ts`: `requireUser()` + verificación de rol; si no es mentor → `redirect('/dashboard')`. Ambos (`requireUser`, `requireMentor`) envueltos en `React.cache()` (una sola resolución por request).
3. **Queries espejo para lectura del mentor** en `lib/db/queries/mentor.ts`: `listStudents(db, mentorId)`, `listTradesForStudent(db, mentorId, studentId)`, `getTradeDetailForStudent(db, mentorId, studentId, tradeId)`, `getCaptureForStudent(...)` — cada una verifica DENTRO de la query que `mentorId` corresponde a una fila con rol `mentor` (defensa en profundidad testeable en PGlite, según la guía del auditor de Fase 1), además del `requireMentor()` en la capa de actions/páginas. Las funciones de estudiante NO se relajan. Los cálculos de métricas reutilizan `lib/metrics` sin cambios.
4. **Escrituras del mentor**: goals (CRUD), levels (update), notifications (create), invitaciones (create vía Clerk). El mentor NUNCA edita trades/journals/capturas de estudiantes.
5. **Estudiantes**: leen sus propios goals, su progreso de nivel y sus notifications (y las marcan leídas). Jamás ven datos de otros estudiantes.

## 4. Modelo de datos (migración nueva)

- **`levels`** — `id` (uuid), `position` (int unique 1..N), `name` (text), `goalAmount` (numeric 12,2 — ganancia acumulada objetivo), `minProfitFactor` (numeric nullable), `minTrades` (int nullable), `maxDrawdownPct` (numeric nullable), `manualUnlock` (bool default false — Nivel 5 "Cuenta fondeada"), `updatedAt`. **Seed en la migración**: los 5 del mockup ($500/$1,000/$2,000/$5,000/Cuenta fondeada; Nivel 3 con PF≥1.8 como referencia del mockup).
- **`manual_level_grants`** — `userId` (fk), `levelId` (fk), `grantedAt` (pk compuesto user+level): registro de desbloqueos manuales del mentor (para `manualUnlock`).
- **`goals`** — `id`, `userId` (fk estudiante), `kind` (enum: `ganancia`|`operaciones`|`win_rate`|`riesgo_diario`|`manual`), `name` (text), `description` (text), `targetValue` (numeric — meta principal; para `manual`: 100), `thresholdValue` (numeric nullable — solo `riesgo_diario`: el % de riesgo diario que no se debe exceder, ej. 2), `manualProgress` (numeric nullable — solo kind manual, 0-100), `startDate` (date — default fecha de creación; ventana de evaluación junto con `dueDate`), `dueDate` (date), `createdAt`, `updatedAt`. Índice `(userId)`.
- **`notifications`** — `id`, `userId` (fk destinatario), `kind` (enum: `felicitacion`|`correccion`|`recordatorio`|`observacion`|`progreso`), `title` (text), `body` (text), `tradeId` (fk nullable, on delete set null), `readAt` (timestamp nullable), `createdAt`. Índices `(userId, readAt)`, `(userId, createdAt)`.

### Cálculos derivados (lib/metrics, funciones puras — nunca almacenados)

- **`computeLevelStatus(trades, initialBalance, levels, manualGrantIds)`** → nivel en curso mostrado en TODAS las superficies; gate de dinero por CONSUMO SECUENCIAL — cada nivel exige ganar su goalAmount DESDE CERO tras completar el anterior (decisión del usuario 2026-08-06, reemplaza los umbrales acumulativos del mockup); gates de PF/trades/drawdown sobre cuenta completa; `manualUnlock` requiere grant, progreso hacia el siguiente (% y faltantes por requisito), estado por nivel (Completado / En curso / Bloqueado). Drawdown máximo = máximo retroceso pico-a-valle de la curva de equidad (nueva función `maxDrawdownPct(equityPoints)`).
- **`computeGoalProgress(goal, trades)`** → `{ current, pct, status }`. Todos los tipos métricos evalúan SOLO los trades con `tradeDate` entre `startDate` y `dueDate`: `ganancia` = netPnl de la ventana; `operaciones` = total de la ventana; `win_rate` = winRate de la ventana; `riesgo_diario` = días consecutivos (hasta hoy) sin que la suma de `riskPct` diaria exceda `thresholdValue`% (meta = `targetValue` días; un día que excede reinicia el conteo, como el mockup "Una sola violación reinicia el conteo"); `manual` = manualProgress. Status: Cumplido / En curso / En riesgo (< 50% a ≤7 días del vencimiento) / Vencido.
- **Métricas de grupo** para el panel (promedios, "requieren atención" = PF < 1) y **ranking** (orden por rentabilidad % sobre balance inicial).

## 5. UI y rutas

### Mentor (nav de 7 items — mockup 597)
- `/panel` — 5 tarjetas de grupo + tabla ranking (mockup 346-377); fila → abrir alumno.
- `/estudiantes/[id]/dashboard` y `/estudiantes/[id]/calendario` — **reutilizan** los componentes de Fase 1 (las páginas existentes se refactorizan para recibir `userId` objetivo + bandera `readOnly`); selector "Viendo a" en el header (mockup 74-83) navega entre alumnos.
- `/comparador` — chips toggle de estudiantes + 8 métricas en barras (mockup 379-403, métricas de 731-740).
- `/objetivos` — selector de alumno + CRUD de objetivos (crear/editar/eliminar) con los tipos del §4.
- `/niveles` — editor de los 5 niveles (nombre, meta, requisitos) + botón de desbloqueo manual por alumno para niveles `manualUnlock`.
- `/mensajes` — historial de notificaciones enviadas (equivalente mentor del centro del estudiante).
- `/invitaciones` — formulario de correo + lista de invitaciones pendientes/aceptadas (API backend de Clerk con `CLERK_SECRET_KEY`; server action `inviteStudent(email)` con validación y mensajes en español).
- **Feedback por trade**: al abrir un trade de un alumno, el modal se muestra en solo-lectura con la sección "Retroalimentación del mentor" (mockup 524-529): tipo + título + cuerpo → `sendFeedback` crea la notification (con `tradeId`). Nota del footer: "Tu comentario llegará al estudiante al guardar".

### Estudiante (nav pasa de 2 a 5 items — mockup 598)
- `/notificaciones` — lista (mockup 254-276): icono por tipo, tag, tiempo relativo, botón "Ver operación · REF" si hay trade; al montarse marca visibles como leídas. Badge de no leídas en Sidebar/BottomNav (recuento en el layout `(app)`).
- `/objetivos` — tarjetas de solo lectura con barra de progreso y estado (mockup 279-306, sin botón Editar).
- `/mi-nivel` — tarjeta grande de progreso + grid de requisitos + carrusel de 5 niveles (mockup 308-344). El banner de nivel sobre el calendario (mockup 194-215) se añade al calendario del estudiante.

## 6. Prerrequisitos técnicos (van primero en el plan — deuda del auditor de Fase 1)

1. `requireUser`/`requireMentor` con `React.cache()`.
2. **Navegación multi-trade por día**: celdas del calendario con >1 trade abren `?dia=YYYY-MM-DD` → panel/lista de las operaciones del día (cada una abre su modal). Lo usan estudiante y mentor.
3. Tests de la capa **actions** con `auth()` simulado (patrón `vi.mock`) — antes de escribir las actions del mentor.
4. Consolidar los 5 arrays de meses y 3 helpers de fecha en `lib/format.ts`.
5. Script `"db:migrate"` en package.json (`dotenv -e .env.local -- drizzle-kit migrate`) — la migración de Fase 2 lo usa.
6. Modal: focus trap, `aria-invalid`/`aria-describedby` en errores, `role=tablist` en pestañas, required markers completos.
7. Autosave: botón "Descartar cambios y cerrar" tras 2 fallos consecutivos de flush (con copia del texto en `localStorage` como respaldo).

## 7. Manejo de errores y estados

Mismo patrón de Fase 1: `ActionResult` + try/catch con `console.error`, mensajes en español, fieldErrors inline. Estados vacíos: panel sin estudiantes (CTA a invitaciones), sin notificaciones, sin objetivos. `revalidatePath` de las rutas afectadas por escritura del mentor.

## 8. Testing

- **TDD** en `lib/metrics`: `maxDrawdownPct`, `computeLevelStatus` (casos: sin trades, nivel 1 en curso, saltos de nivel, gate de PF que retiene, manualUnlock sin/con grant), `computeGoalProgress` (los 5 tipos + estados).
- **PGlite**: matriz de autorización extendida — mentor lee trades de alumno ✓; queries mentor no filtran datos de otros cuando se pide un alumno concreto; goals/levels/notifications con ownership correcto (estudiante no crea goals, no lee notifications ajenas, no edita levels).
- **Actions** (nuevo): `sendFeedback`, `createGoal`, `updateLevel`, `inviteStudent` con auth simulada — un estudiante invocándolas recibe rechazo.

## 9. Criterios de aceptación

- [ ] El correo `MENTOR_EMAIL` entra y ve el panel del grupo; cualquier otro usuario sigue viendo su app de estudiante sin acceso a rutas de mentor (verificado por test y manual).
- [ ] El mentor abre el dashboard/calendario de un alumno idéntico al que ve el alumno (solo lectura).
- [ ] Feedback enviado desde un trade aparece en las notificaciones del alumno con badge, y el enlace "Ver operación" abre ese trade.
- [ ] Objetivos asignados muestran progreso auto-calculado correcto; niveles se calculan de las métricas reales y el mentor puede editar definiciones y otorgar el nivel manual.
- [ ] Invitación enviada desde la app llega por correo y permite registrarse.
- [ ] Días con múltiples operaciones son todos accesibles (estudiante y mentor).
- [ ] Todo responsive y fiel a Nocturne/mockup en 1440/768/390.
