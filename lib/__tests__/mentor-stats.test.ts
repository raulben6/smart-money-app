import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '@/lib/db/__tests__/helpers'
import { users, levels, type DbUser } from '@/lib/db/schema'
import { insertTradeWithJournal } from '@/lib/db/queries/trades'
import type { TradeFormValues } from '@/lib/validation/trade'
import { loadStudentStats, computePanelSummary, resolveComparedIds, type StudentStats } from '../mentor-stats'

const minimalTrade: TradeFormValues = {
  tradeDate: '2026-07-01',
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
  pnlUsd: 0,
  rMultiple: null,
  setup: '',
  timeframe: '',
  marketConditions: null,
  entryType: null,
  confirmations: null,
}

/** Construye un `StudentStats` sintético para los tests puros (computePanelSummary/resolveComparedIds) — sin tocar la DB. */
function fakeStats(overrides: {
  id?: string
  name: string
  winRate?: number | null
  profitFactor?: number | null
  ret?: number
  lastTradeDate?: string | null
}): StudentStats {
  const id = overrides.id ?? randomUUID()
  const student: DbUser = {
    id,
    clerkId: `clerk_${id}`,
    role: 'student',
    name: overrides.name,
    initialBalance: null,
    createdAt: new Date(),
  }
  return {
    student,
    summary: {
      balance: 0,
      netPnl: 0,
      grossProfit: 0,
      grossLoss: 0,
      wins: 0,
      losses: 0,
      total: 0,
      winRate: overrides.winRate ?? null,
      profitFactor: overrides.profitFactor ?? null,
      expectancy: null,
      avgWin: null,
      avgLoss: null,
      rbRatio: null,
      bestTrade: null,
      worstTrade: null,
    },
    dd: 0,
    ret: overrides.ret ?? 0,
    levelName: 'Nivel 1',
    avgRiskPct: null,
    lastTradeDate: overrides.lastTradeDate ?? null,
    pfInfinite: false, // irrelevante para computePanelSummary/resolveComparedIds (ningún test de esta sección lo consulta)
  }
}

describe('computePanelSummary', () => {
  it('sin estudiantes -> todos los agregados en su valor neutro, sin alertas', () => {
    expect(computePanelSummary([], '2026-08-10')).toEqual({
      studentCount: 0,
      activeCount: 0,
      avgReturnPct: 0,
      avgWinRate: null,
      avgProfitFactor: null,
      alertCount: 0,
      firstAlert: null,
    })
  })

  it('avgReturnPct promedia ret con signo (positivos y negativos)', () => {
    const stats = [fakeStats({ name: 'A', ret: 10 }), fakeStats({ name: 'B', ret: -4 })]
    expect(computePanelSummary(stats, '2026-08-10').avgReturnPct).toBe(3)
  })

  it('avgWinRate/avgProfitFactor promedian solo los estudiantes con valor no-null', () => {
    const stats = [
      fakeStats({ name: 'A', winRate: 60, profitFactor: 2 }),
      fakeStats({ name: 'B', winRate: null, profitFactor: null }), // sin trades
    ]
    const summary = computePanelSummary(stats, '2026-08-10')
    expect(summary.avgWinRate).toBe(60)
    expect(summary.avgProfitFactor).toBe(2)
  })

  it('avgProfitFactor es null cuando NINGÚN estudiante tiene PF computable', () => {
    const stats = [fakeStats({ name: 'A', profitFactor: null }), fakeStats({ name: 'B', profitFactor: null })]
    expect(computePanelSummary(stats, '2026-08-10').avgProfitFactor).toBeNull()
  })

  it('alertCount cuenta PF < 1 O ret < 0; firstAlert es el primero en el orden de `stats`', () => {
    const stats = [
      fakeStats({ name: 'Sana', profitFactor: 2, ret: 5 }),
      fakeStats({ name: 'Diego', profitFactor: 0.86, ret: 3 }), // PF < 1
      fakeStats({ name: 'Ana', profitFactor: 2, ret: -1 }), // ret < 0
    ]
    const summary = computePanelSummary(stats, '2026-08-10')
    expect(summary.alertCount).toBe(2)
    expect(summary.firstAlert).toEqual({ name: 'Diego', profitFactor: 0.86 })
  })

  it("sin ningún estudiante en alerta, firstAlert es null (la página muestra 'Sin alertas')", () => {
    const stats = [fakeStats({ name: 'A', profitFactor: 2, ret: 5 })]
    expect(computePanelSummary(stats, '2026-08-10').firstAlert).toBeNull()
  })

  it('activeCount: la ventana de "últimos 7 días" es [hoy-6, hoy] inclusive', () => {
    const stats = [
      fakeStats({ name: 'Borde inferior', lastTradeDate: '2026-08-04' }), // hoy-6 -> activo
      fakeStats({ name: 'Justo fuera', lastTradeDate: '2026-08-03' }), // hoy-7 -> NO activo
      fakeStats({ name: 'Hoy', lastTradeDate: '2026-08-10' }), // hoy -> activo
      fakeStats({ name: 'Sin trades', lastTradeDate: null }), // NO activo
    ]
    expect(computePanelSummary(stats, '2026-08-10').activeCount).toBe(2)
  })

  it('activeCount: el corte de 7 días cruza correctamente un límite de mes', () => {
    // hoy=3 ago, hoy-6 = 28 jul (agosto no tiene día 3-6=-3; se normaliza restando de julio).
    const stats = [
      fakeStats({ name: 'Dentro', lastTradeDate: '2026-07-28' }),
      fakeStats({ name: 'Fuera', lastTradeDate: '2026-07-27' }),
    ]
    expect(computePanelSummary(stats, '2026-08-03').activeCount).toBe(1)
  })
})

describe('resolveComparedIds', () => {
  const a = fakeStats({ name: 'A' })
  const b = fakeStats({ name: 'B' })
  const c = fakeStats({ name: 'C' })
  const d = fakeStats({ name: 'D' })
  const stats = [a, b, c, d]

  it('sin parámetro (`undefined`), con más de 3 estudiantes -> los primeros 3 en el orden de `stats`', () => {
    expect(resolveComparedIds(stats, undefined)).toEqual([a.student.id, b.student.id, c.student.id])
  })

  it('sin parámetro, con ≤3 estudiantes -> todos', () => {
    const pocos = [a, b]
    expect(resolveComparedIds(pocos, undefined)).toEqual([a.student.id, b.student.id])
  })

  it('parámetro válido -> se respeta el orden dado en la URL (no el de `stats`)', () => {
    expect(resolveComparedIds(stats, `${c.student.id},${a.student.id}`)).toEqual([c.student.id, a.student.id])
  })

  it('filtra ids sin forma de UUID y ids ajenos a `stats`, conservando los válidos', () => {
    const idAjeno = randomUUID()
    expect(resolveComparedIds(stats, `no-es-un-uuid,${a.student.id},${idAjeno},${b.student.id}`)).toEqual([
      a.student.id,
      b.student.id,
    ])
  })

  it('deduplica ids repetidos', () => {
    expect(resolveComparedIds(stats, `${a.student.id},${a.student.id},${b.student.id}`)).toEqual([a.student.id, b.student.id])
  })

  it('parámetro vacío o compuesto solo por ids inválidos -> cae al default', () => {
    expect(resolveComparedIds(stats, '')).toEqual([a.student.id, b.student.id, c.student.id])
    expect(resolveComparedIds(stats, 'no-es-un-uuid,tampoco')).toEqual([a.student.id, b.student.id, c.student.id])
  })
})

describe('loadStudentStats (integración con DB)', () => {
  async function seedMentorAndStudents(db: TestDb) {
    const [mentor] = await db.insert(users).values({ clerkId: 'clerk_mentor', role: 'mentor', name: 'Mentor M' }).returning()
    const [studentA] = await db
      .insert(users)
      .values({ clerkId: 'clerk_a', role: 'student', name: 'Estudiante A', initialBalance: 1000 })
      .returning()
    const [studentB] = await db
      .insert(users)
      .values({ clerkId: 'clerk_b', role: 'student', name: 'Estudiante B', initialBalance: 2000 })
      .returning()
    return { mentor, studentA, studentB }
  }

  it('mentorId que no es mentor -> []', async () => {
    const db = await createTestDb()
    const { studentA } = await seedMentorAndStudents(db)
    expect(await loadStudentStats(db, studentA.id)).toEqual([])
  })

  it('compone summary/dd/ret/levelName/avgRiskPct/lastTradeDate/pfInfinite correctamente por estudiante', async () => {
    const db = await createTestDb()
    const { mentor, studentA, studentB } = await seedMentorAndStudents(db)
    const [studentC] = await db
      .insert(users)
      .values({ clerkId: 'clerk_c', role: 'student', name: 'Estudiante C', initialBalance: 500 })
      .returning()

    // Renombrar Nivel 1 y Nivel 2 (sembrados por la migración) para poder distinguir, en
    // las aserciones de abajo, "levelName == nombre REAL del nivel EN CURSO" (next, la
    // semántica vigente tras la unificación de display F2) de "levelName == nombre REAL
    // del nivel ya completado" (current, la semántica ANTERIOR que quedó derogada) de
    // "levelName == el literal 'Nivel 1' hardcodeado" (fallback aún más viejo) — con los
    // nombres originales, las tres ramas producirían textos indistinguibles por coincidencia.
    await db.update(levels).set({ name: 'Bronce' }).where(eq(levels.position, 1))
    await db.update(levels).set({ name: 'Plata' }).where(eq(levels.position, 2))

    // 10 trades (minTrades del Nivel 1 = 10) que suman netPnl=800 (>= goalAmount=500):
    // completa el Nivel 1 pero NO el Nivel 2 (netPnl=800 < goalAmount=1000 de Plata).
    // wins=7, losses=3 -> profitFactor = 1000/200 = 5, winRate=70%.
    const pnls = [400, 300, -100, 50, 50, -50, 50, 50, -50, 100]
    const riskPcts: (number | null)[] = [2, 1.5, null, null, null, null, null, null, null, null]
    for (let i = 0; i < pnls.length; i++) {
      await insertTradeWithJournal(db, studentA.id, {
        ...minimalTrade,
        tradeDate: `2026-07-${String(i + 1).padStart(2, '0')}`,
        pnlUsd: pnls[i],
        riskPct: riskPcts[i],
      })
    }

    // Récord perfecto: 3 trades, todos ganadores -> grossLoss=0, grossProfit=450 ->
    // profitFactor null (misma forma que "sin trades"), pero pfInfinite debe ser true.
    for (const pnl of [100, 200, 150]) {
      await insertTradeWithJournal(db, studentC.id, { ...minimalTrade, tradeDate: '2026-07-01', pnlUsd: pnl })
    }

    const stats = await loadStudentStats(db, mentor.id)
    expect(stats).toHaveLength(3)

    const a = stats.find((s) => s.student.id === studentA.id)!
    expect(a.summary.total).toBe(10)
    expect(a.summary.netPnl).toBe(800)
    expect(a.summary.winRate).toBe(70)
    expect(a.summary.profitFactor).toBe(5)
    expect(a.ret).toBe(80) // 800 / 1000 * 100
    expect(a.levelName).toBe('Plata') // next = Nivel 2 en curso (NO 'Bronce', que es `current`: next gana sobre current, decisión de unificación de display F2)
    expect(a.avgRiskPct).toBe(1.75) // media de [2, 1.5] — ignora los 8 trades sin riskPct
    expect(a.lastTradeDate).toBe('2026-07-10')
    expect(a.pfInfinite).toBe(false) // tiene pérdidas -> profitFactor numérico, no infinito
    // Balances: 1000 (inicial) -> 1400 -> 1700 -> 1600 -> 1650 -> 1700 -> 1650 -> 1700 -> 1750 -> 1700 -> 1800.
    // El único pico-a-valle es 1700 -> 1600.
    expect(a.dd).toBeCloseTo((100 / 1700) * 100, 6)

    const b = stats.find((s) => s.student.id === studentB.id)!
    expect(b.summary.total).toBe(0)
    expect(b.summary.profitFactor).toBeNull()
    expect(b.ret).toBe(0)
    // Sin trades -> next = Nivel 1 (el de menor position) = 'Bronce' (current es null, así
    // que next gana igual bajo la nueva semántica); NUNCA el literal 'Nivel 1' que el
    // código hardcodeaba en un fallback aún más viejo (habría quedado obsoleto en cuanto
    // el mentor lo renombró arriba).
    expect(b.levelName).toBe('Bronce')
    expect(b.avgRiskPct).toBeNull()
    expect(b.lastTradeDate).toBeNull()
    expect(b.dd).toBe(0)
    expect(b.pfInfinite).toBe(false) // sin trades: PF null es "sin dato", NO "récord perfecto"

    const c = stats.find((s) => s.student.id === studentC.id)!
    expect(c.summary.total).toBe(3)
    expect(c.summary.profitFactor).toBeNull() // misma forma que "sin trades" — grossLoss=0
    expect(c.pfInfinite).toBe(true) // pero SÍ tiene trades, todos ganadores -> PF efectivamente infinito
  })
})
