import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../__tests__/helpers'
import { users, levels, goals, notifications, tradeCaptures, trades, type DbUser } from '../../schema'
import { insertTradeWithJournal } from '../trades'
import { listStudents, listTradesForStudent, getTradeDetailForStudent, getCaptureForStudent, getStudentById } from '../mentor'
import { listGoalsForUser, listGoalsForStudent, insertGoal, updateGoalById, deleteGoalById } from '../goals'
import { listLevels, updateLevelById, grantLevel, revokeGrant, listGrantIdsForUser } from '../levels'
import {
  insertNotification,
  listNotificationsForUser,
  markAllReadForUser,
  unreadCountForUser,
  listSentNotifications,
} from '../notifications'
import type { TradeFormValues } from '@/lib/validation/trade'
import type { GoalFormValues, LevelFormValues, FeedbackFormValues } from '@/lib/validation/mentor'

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

const minimalGoal: GoalFormValues = {
  kind: 'ganancia',
  name: 'Meta de ganancia',
  description: '',
  targetValue: 1000,
  thresholdValue: null,
  manualProgress: null,
  startDate: '2026-08-01',
  dueDate: '2026-08-31',
}

const minimalLevelValues: LevelFormValues = {
  name: 'Nivel actualizado',
  goalAmount: 5000,
  minProfitFactor: null,
  minTrades: null,
  maxDrawdownPct: null,
}

const minimalFeedback: FeedbackFormValues = {
  kind: 'felicitacion',
  title: 'Buen trabajo',
  body: 'Sigue así',
  tradeId: null,
}

async function seedMentorAndStudents(db: TestDb) {
  const [mentor] = await db.insert(users).values({ clerkId: 'clerk_mentor', role: 'mentor', name: 'Mentor M' }).returning()
  const [studentA] = await db.insert(users).values({ clerkId: 'clerk_a', role: 'student', name: 'Estudiante A' }).returning()
  const [studentB] = await db.insert(users).values({ clerkId: 'clerk_b', role: 'student', name: 'Estudiante B' }).returning()
  return { mentor, studentA, studentB }
}

// La migración 0001 ya siembra 5 niveles (positions 1-5, ver drizzle/0001_*.sql) como
// datos de referencia — no se insertan niveles propios en los tests: se leen los que
// ya existen tras `createTestDb()` (mismo dato que verá producción).
async function getLevelByPosition(db: TestDb, position: number) {
  const [row] = await db.select().from(levels).where(eq(levels.position, position))
  if (!row) throw new Error(`No existe un nivel sembrado con position=${position}`)
  return row
}

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000'

describe('lib/db/queries — matriz de autorización de mentor', () => {
  let db: TestDb
  let mentor: DbUser, studentA: DbUser, studentB: DbUser

  beforeEach(async () => {
    db = await createTestDb()
    ;({ mentor, studentA, studentB } = await seedMentorAndStudents(db))
  })

  describe('mentor.ts', () => {
    it('(a) listStudents(mentor) devuelve solo los estudiantes; listStudents(estudiante) -> []', async () => {
      const paraMentor = await listStudents(db, mentor.id)
      expect(paraMentor.map((u) => u.id).sort()).toEqual([studentA.id, studentB.id].sort())

      const paraEstudiante = await listStudents(db, studentA.id)
      expect(paraEstudiante).toEqual([])
    })

    it('listStudents(idInexistente) -> []', async () => {
      expect(await listStudents(db, NONEXISTENT_ID)).toEqual([])
    })

    it('(b) listTradesForStudent(mentor, A) devuelve los trades de A; listTradesForStudent(A, B) -> [] (A no es mentor)', async () => {
      const tradeId = await insertTradeWithJournal(db, studentA.id, minimalTrade)

      const paraMentor = await listTradesForStudent(db, mentor.id, studentA.id)
      expect(paraMentor).toHaveLength(1)
      expect(paraMentor[0].id).toBe(tradeId)

      const paraEstudiante = await listTradesForStudent(db, studentA.id, studentB.id)
      expect(paraEstudiante).toEqual([])
    })

    it('listTradesForStudent(mentor, mentor) -> [] (el target no es un estudiante)', async () => {
      expect(await listTradesForStudent(db, mentor.id, mentor.id)).toEqual([])
    })

    it('listTradesForStudent(mentor, A) NO incluye trades de B (aislamiento real del filtro, no solo el gate de rol)', async () => {
      // Ambos estudiantes tienen trades en la MISMA base: si el WHERE por userId se
      // quitara, esta consulta seguiría pasando el gate isMentor/isStudent y devolvería
      // también el trade de B — a diferencia de la prueba (b), que nunca sembró un
      // trade de B y por tanto no puede detectar esa regresión.
      const tradeIdA = await insertTradeWithJournal(db, studentA.id, minimalTrade)
      await insertTradeWithJournal(db, studentB.id, { ...minimalTrade, asset: 'MSFT' })

      const paraA = await listTradesForStudent(db, mentor.id, studentA.id)
      expect(paraA.map((t) => t.id)).toEqual([tradeIdA])
    })

    it('(c) getTradeDetailForStudent(mentor, A, tradeDeA) -> detalle; getTradeDetailForStudent(mentor, B, tradeDeA) -> null (studentId no coincide con el dueño)', async () => {
      const tradeId = await insertTradeWithJournal(db, studentA.id, minimalTrade)

      const detalle = await getTradeDetailForStudent(db, mentor.id, studentA.id, tradeId)
      expect(detalle).not.toBeNull()
      expect(detalle?.trade.id).toBe(tradeId)
      expect(detalle?.journal).not.toBeNull()
      expect(detalle?.captures).toEqual([])

      const cruzado = await getTradeDetailForStudent(db, mentor.id, studentB.id, tradeId)
      expect(cruzado).toBeNull()
    })

    it('getTradeDetailForStudent(A, A, tradeDeA) -> null (el llamador no es mentor)', async () => {
      const tradeId = await insertTradeWithJournal(db, studentA.id, minimalTrade)
      expect(await getTradeDetailForStudent(db, studentA.id, studentA.id, tradeId)).toBeNull()
    })

    it('getCaptureForStudent(mentor, capturaDeA) -> captura; getCaptureForStudent(A, capturaDeA) -> null (A no es mentor)', async () => {
      const tradeId = await insertTradeWithJournal(db, studentA.id, minimalTrade)
      const [capture] = await db
        .insert(tradeCaptures)
        .values({ tradeId, phase: 'before', blobPathname: `captures/${tradeId}/before`, contentType: 'image/png' })
        .returning()

      const paraMentor = await getCaptureForStudent(db, mentor.id, capture.id)
      expect(paraMentor).not.toBeNull()
      expect(paraMentor?.id).toBe(capture.id)

      const paraEstudiante = await getCaptureForStudent(db, studentA.id, capture.id)
      expect(paraEstudiante).toBeNull()
    })

    it('getCaptureForStudent(mentor, idInexistente) -> null', async () => {
      expect(await getCaptureForStudent(db, mentor.id, NONEXISTENT_ID)).toBeNull()
    })

    it('getStudentById(mentor, A) -> A; getStudentById(A, B) -> null (A no es mentor)', async () => {
      const paraMentor = await getStudentById(db, mentor.id, studentA.id)
      expect(paraMentor?.id).toBe(studentA.id)
      expect(paraMentor?.name).toBe('Estudiante A')

      const paraEstudiante = await getStudentById(db, studentA.id, studentB.id)
      expect(paraEstudiante).toBeNull()
    })

    it('getStudentById(mentor, mentor) -> null (el target no es un estudiante)', async () => {
      expect(await getStudentById(db, mentor.id, mentor.id)).toBeNull()
    })

    it('getStudentById(mentor, idInexistente) -> null', async () => {
      expect(await getStudentById(db, mentor.id, NONEXISTENT_ID)).toBeNull()
    })

    it('getCaptureForStudent excluye una captura cuyo trade pertenece al propio mentor (el join exige users.role=student, no solo el gate isMentor)', async () => {
      // Se inserta un trade directamente con userId = mentor.id (fuera del flujo normal
      // de la app: un mentor no opera) precisamente para poder distinguir "el filtro de
      // rol del join funciona" de "el gate isMentor funciona" — sin esta fila, ambas
      // versiones (con y sin `eq(users.role, 'student')` en el WHERE) devolverían el
      // mismo resultado en el resto de la suite.
      const [tradeDelMentor] = await db
        .insert(trades)
        .values({ ...minimalTrade, userId: mentor.id })
        .returning()
      const [capturaDelMentor] = await db
        .insert(tradeCaptures)
        .values({
          tradeId: tradeDelMentor.id,
          phase: 'before',
          blobPathname: `captures/${tradeDelMentor.id}/before`,
          contentType: 'image/png',
        })
        .returning()

      expect(await getCaptureForStudent(db, mentor.id, capturaDelMentor.id)).toBeNull()
    })
  })

  describe('goals.ts', () => {
    it('(d) insertGoal(mentor, A, ...) crea y aparece en listGoalsForUser(A)', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)
      expect(typeof goalId).toBe('string')

      const propias = await listGoalsForUser(db, studentA.id)
      expect(propias).toHaveLength(1)
      expect(propias[0].id).toBe(goalId)
      expect(propias[0].userId).toBe(studentA.id)
    })

    it('insertGoal(A, B, ...) -> null (A no es mentor) y no crea ninguna fila', async () => {
      const goalId = await insertGoal(db, studentA.id, studentB.id, minimalGoal)
      expect(goalId).toBeNull()
      expect(await listGoalsForUser(db, studentB.id)).toEqual([])
    })

    it('insertGoal(mentor, mentor, ...) -> null (el target no es un estudiante)', async () => {
      expect(await insertGoal(db, mentor.id, mentor.id, minimalGoal)).toBeNull()
    })

    it('insertGoal(mentor, idInexistente, ...) -> null', async () => {
      expect(await insertGoal(db, mentor.id, NONEXISTENT_ID, minimalGoal)).toBeNull()
    })

    it('insertGoal ignora una clave hostil `userId` en el payload (el objetivo queda en el estudiante autorizado, no en el hostil)', async () => {
      const hostilePayload = { ...minimalGoal, userId: studentB.id } as GoalFormValues & { userId: string }

      const goalId = await insertGoal(db, mentor.id, studentA.id, hostilePayload)
      expect(typeof goalId).toBe('string')

      const deA = await listGoalsForUser(db, studentA.id)
      expect(deA.map((g) => g.id)).toEqual([goalId])

      const deB = await listGoalsForUser(db, studentB.id)
      expect(deB).toEqual([])
    })

    it('listGoalsForStudent(mentor, A) -> objetivos de A; listGoalsForStudent(A, B) -> [] (A no es mentor)', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)

      const paraMentor = await listGoalsForStudent(db, mentor.id, studentA.id)
      expect(paraMentor.map((g) => g.id)).toEqual([goalId])

      const paraEstudiante = await listGoalsForStudent(db, studentA.id, studentB.id)
      expect(paraEstudiante).toEqual([])
    })

    it('listGoalsForStudent(mentor, A) y listGoalsForUser(A) NO incluyen objetivos de B (aislamiento real, ambos con objetivos en la misma base)', async () => {
      const goalIdA = await insertGoal(db, mentor.id, studentA.id, minimalGoal)
      await insertGoal(db, mentor.id, studentB.id, { ...minimalGoal, name: 'Meta de B' })

      const paraMentorSobreA = await listGoalsForStudent(db, mentor.id, studentA.id)
      expect(paraMentorSobreA.map((g) => g.id)).toEqual([goalIdA])

      const propiasDeA = await listGoalsForUser(db, studentA.id)
      expect(propiasDeA.map((g) => g.id)).toEqual([goalIdA])
    })

    it('(d) updateGoalById(A, goalDeA, ...) -> false (un estudiante no edita ni sus propios objetivos)', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)

      const ok = await updateGoalById(db, studentA.id, goalId!, { ...minimalGoal, name: 'Hackeado' })
      expect(ok).toBe(false)

      const propias = await listGoalsForUser(db, studentA.id)
      expect(propias[0].name).toBe('Meta de ganancia')
    })

    it('updateGoalById(mentor, goalDeA, ...) -> true y refleja los cambios', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)

      const ok = await updateGoalById(db, mentor.id, goalId!, { ...minimalGoal, name: 'Meta ajustada', targetValue: 2000 })
      expect(ok).toBe(true)

      const [actualizado] = await listGoalsForUser(db, studentA.id)
      expect(actualizado.name).toBe('Meta ajustada')
      expect(actualizado.targetValue).toBe(2000)
    })

    it('updateGoalById ignora una clave hostil `userId` en el payload (no reparenta el objetivo a otro estudiante)', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)

      const hostilePayload = { ...minimalGoal, name: 'Hackeado', userId: studentB.id } as GoalFormValues & {
        userId: string
      }
      const ok = await updateGoalById(db, mentor.id, goalId!, hostilePayload)
      expect(ok).toBe(true)

      const [row] = await db.select().from(goals).where(eq(goals.id, goalId!))
      expect(row.name).toBe('Hackeado')
      expect(row.userId).toBe(studentA.id)
    })

    it('updateGoalById(mentor, idInexistente, ...) -> false', async () => {
      expect(await updateGoalById(db, mentor.id, NONEXISTENT_ID, minimalGoal)).toBe(false)
    })

    it('deleteGoalById(A, goalDeA) -> false; deleteGoalById(mentor, goalDeA) -> true y desaparece', async () => {
      const goalId = await insertGoal(db, mentor.id, studentA.id, minimalGoal)

      const noAutorizado = await deleteGoalById(db, studentA.id, goalId!)
      expect(noAutorizado).toBe(false)
      expect(await listGoalsForUser(db, studentA.id)).toHaveLength(1)

      const autorizado = await deleteGoalById(db, mentor.id, goalId!)
      expect(autorizado).toBe(true)
      expect(await listGoalsForUser(db, studentA.id)).toEqual([])
    })
  })

  describe('levels.ts', () => {
    it('listLevels devuelve todos los niveles (sembrados por la migración 0001) ordenados por position', async () => {
      const lista = await listLevels(db)
      expect(lista.map((l) => l.position)).toEqual([1, 2, 3, 4, 5])
    })

    it('(e) updateLevelById(A, ...) -> false y el nivel queda intacto (sin cambios, no solo "false")', async () => {
      const nivel1 = await getLevelByPosition(db, 1)

      // Usa un valor DISTINTO al de la prueba de éxito para poder distinguir "el
      // cambio se aplicó igualmente" de "el cambio fue realmente rechazado": si
      // ambas pruebas usaran el mismo `minimalLevelValues`, una implementación que
      // ignorara el gate de autorización y aplicara el update de todos modos pasaría
      // esta prueba sin que se notara.
      const noAutorizado = await updateLevelById(db, studentA.id, nivel1.id, {
        ...minimalLevelValues,
        name: 'Intento denegado',
      })
      expect(noAutorizado).toBe(false)

      const [intacto] = await db.select().from(levels).where(eq(levels.id, nivel1.id))
      expect(intacto.name).toBe('Nivel 1') // el nombre original sembrado por la migración, NO 'Intento denegado'
      expect(intacto.goalAmount).toBe(500)
    })

    it('updateLevelById(mentor, ...) -> true y actualiza los campos', async () => {
      const nivel1 = await getLevelByPosition(db, 1)

      const autorizado = await updateLevelById(db, mentor.id, nivel1.id, minimalLevelValues)
      expect(autorizado).toBe(true)

      const [actualizado] = await db.select().from(levels).where(eq(levels.id, nivel1.id))
      expect(actualizado.name).toBe('Nivel actualizado')
      expect(actualizado.goalAmount).toBe(5000)
      expect(actualizado.position).toBe(1) // la posición no forma parte de LevelFormValues, no debe cambiar
    })

    it('updateLevelById(mentor, idInexistente, ...) -> false', async () => {
      expect(await updateLevelById(db, mentor.id, NONEXISTENT_ID, minimalLevelValues)).toBe(false)
    })

    it('updateLevelById ignora una clave hostil `id` en el payload (no redirige la escritura a otro nivel)', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      const nivel2 = await getLevelByPosition(db, 2)

      const hostilePayload = { ...minimalLevelValues, id: nivel2.id } as LevelFormValues & { id: string }

      const ok = await updateLevelById(db, mentor.id, nivel1.id, hostilePayload)
      expect(ok).toBe(true)

      const [actualizado] = await db.select().from(levels).where(eq(levels.id, nivel1.id))
      expect(actualizado.name).toBe('Nivel actualizado') // el nivel1 (el pasado como argumento) sí cambió

      const [otroIntacto] = await db.select().from(levels).where(eq(levels.id, nivel2.id))
      expect(otroIntacto.name).toBe('Nivel 2') // el nivel2 (el de la clave hostil `id`) queda intacto
    })

    it('(e) grantLevel(mentor, A, nivel5) -> true y aparece en listGrantIdsForUser(A)', async () => {
      const nivel5 = await getLevelByPosition(db, 5)

      const ok = await grantLevel(db, mentor.id, studentA.id, nivel5.id)
      expect(ok).toBe(true)

      const ids = await listGrantIdsForUser(db, studentA.id)
      expect(ids).toEqual([nivel5.id])
    })

    it('grantLevel(A, ...) -> false (A no es mentor) y no aparece ningún grant', async () => {
      const nivel5 = await getLevelByPosition(db, 5)

      const ok = await grantLevel(db, studentA.id, studentB.id, nivel5.id)
      expect(ok).toBe(false)
      expect(await listGrantIdsForUser(db, studentB.id)).toEqual([])
    })

    it('grantLevel(mentor, mentor, nivel) -> false (el target no es estudiante)', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      expect(await grantLevel(db, mentor.id, mentor.id, nivel1.id)).toBe(false)
    })

    it('grantLevel es idempotente (onConflictDoNothing): otorgar el mismo nivel dos veces no duplica la fila', async () => {
      const nivel5 = await getLevelByPosition(db, 5)

      expect(await grantLevel(db, mentor.id, studentA.id, nivel5.id)).toBe(true)
      expect(await grantLevel(db, mentor.id, studentA.id, nivel5.id)).toBe(true)

      expect(await listGrantIdsForUser(db, studentA.id)).toEqual([nivel5.id])
    })

    it('revokeGrant(mentor, A, nivel5) -> true y desaparece; revokeGrant(A, ...) -> false', async () => {
      const nivel5 = await getLevelByPosition(db, 5)
      await grantLevel(db, mentor.id, studentA.id, nivel5.id)

      const noAutorizado = await revokeGrant(db, studentA.id, studentA.id, nivel5.id)
      expect(noAutorizado).toBe(false)
      expect(await listGrantIdsForUser(db, studentA.id)).toEqual([nivel5.id])

      const autorizado = await revokeGrant(db, mentor.id, studentA.id, nivel5.id)
      expect(autorizado).toBe(true)
      expect(await listGrantIdsForUser(db, studentA.id)).toEqual([])
    })

    it('revokeGrant(mentor, A, nivelNoOtorgado) -> false (nada que borrar)', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      expect(await revokeGrant(db, mentor.id, studentA.id, nivel1.id)).toBe(false)
    })

    it('listGrantIdsForUser(A) NO incluye grants de B (aislamiento real, ambos con grants en la misma base)', async () => {
      const nivel1 = await getLevelByPosition(db, 1)
      const nivel5 = await getLevelByPosition(db, 5)

      await grantLevel(db, mentor.id, studentA.id, nivel1.id)
      await grantLevel(db, mentor.id, studentB.id, nivel5.id)

      expect(await listGrantIdsForUser(db, studentA.id)).toEqual([nivel1.id])
      expect(await listGrantIdsForUser(db, studentB.id)).toEqual([nivel5.id])
    })
  })

  describe('notifications.ts', () => {
    it('insertNotification(A, {...}) -> null (A no es mentor) y no crea ninguna fila', async () => {
      const id = await insertNotification(db, studentA.id, { userId: studentB.id, ...minimalFeedback })
      expect(id).toBeNull()
      expect(await listNotificationsForUser(db, studentB.id)).toEqual([])
    })

    it('(f) insertNotification(mentor, {userId: A, ...}) -> id y aparece en listNotificationsForUser(A)', async () => {
      const id = await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      expect(typeof id).toBe('string')

      const paraA = await listNotificationsForUser(db, studentA.id)
      expect(paraA).toHaveLength(1)
      expect(paraA[0].id).toBe(id)
      expect(paraA[0].title).toBe('Buen trabajo')
    })

    it('insertNotification a un destinatario mentor -> null', async () => {
      expect(await insertNotification(db, mentor.id, { userId: mentor.id, ...minimalFeedback })).toBeNull()
    })

    it('insertNotification a un destinatario inexistente -> null', async () => {
      expect(await insertNotification(db, mentor.id, { userId: NONEXISTENT_ID, ...minimalFeedback })).toBeNull()
    })

    it('(f) listNotificationsForUser(B) no ve las notificaciones de A', async () => {
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      expect(await listNotificationsForUser(db, studentB.id)).toEqual([])
    })

    it('(f) markAllReadForUser(A) solo marca como leídas las de A y devuelve el número de filas afectadas', async () => {
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback, title: 'Segunda' })
      await insertNotification(db, mentor.id, { userId: studentB.id, ...minimalFeedback, title: 'Para B' })

      const afectadas = await markAllReadForUser(db, studentA.id)
      expect(afectadas).toBe(2)

      const deA = await listNotificationsForUser(db, studentA.id)
      expect(deA.every((n) => n.readAt !== null)).toBe(true)

      const deB = await listNotificationsForUser(db, studentB.id)
      expect(deB[0].readAt).toBeNull()
    })

    it('(f) unreadCountForUser refleja correctamente antes y después de markAllReadForUser', async () => {
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback, title: 'Segunda' })

      expect(await unreadCountForUser(db, studentA.id)).toBe(2)

      await markAllReadForUser(db, studentA.id)

      expect(await unreadCountForUser(db, studentA.id)).toBe(0)
    })

    it('markAllReadForUser(A) es idempotente: una segunda llamada devuelve 0 (no quedan no leídas)', async () => {
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      await markAllReadForUser(db, studentA.id)
      expect(await markAllReadForUser(db, studentA.id)).toBe(0)
    })

    it('insertNotification ignora una clave hostil `id` en el payload (no colisiona ni reparenta una notificación existente)', async () => {
      const [existente] = await db
        .insert(notifications)
        .values({ userId: studentB.id, kind: 'observacion', title: 'Original de B', body: 'Cuerpo original' })
        .returning()

      const hostilePayload = {
        userId: studentA.id,
        ...minimalFeedback,
        id: existente.id,
      } as FeedbackFormValues & { userId: string; id: string }

      const nuevoId = await insertNotification(db, mentor.id, hostilePayload)
      expect(typeof nuevoId).toBe('string')
      expect(nuevoId).not.toBe(existente.id)

      const [original] = await db.select().from(notifications).where(eq(notifications.id, existente.id))
      expect(original.title).toBe('Original de B')
      expect(original.userId).toBe(studentB.id)

      const deA = await listNotificationsForUser(db, studentA.id)
      expect(deA).toHaveLength(1)
      expect(deA[0].id).toBe(nuevoId)
    })

    it('(f) listSentNotifications(mentor) incluye studentName vía join; listSentNotifications(A) -> [] (A no es mentor)', async () => {
      await insertNotification(db, mentor.id, { userId: studentA.id, ...minimalFeedback })
      await insertNotification(db, mentor.id, { userId: studentB.id, ...minimalFeedback, title: 'Para B' })

      const enviadas = await listSentNotifications(db, mentor.id)
      expect(enviadas).toHaveLength(2)
      const porEstudiante = new Map(enviadas.map((n) => [n.userId, n.studentName]))
      expect(porEstudiante.get(studentA.id)).toBe('Estudiante A')
      expect(porEstudiante.get(studentB.id)).toBe('Estudiante B')

      expect(await listSentNotifications(db, studentA.id)).toEqual([])
    })
  })
})
