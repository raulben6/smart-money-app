import { describe, it, expect } from 'vitest'
import { goalSchema, levelSchema, feedbackSchema, inviteSchema } from '../mentor'

const validGoalBase = {
  kind: 'ganancia' as const,
  name: 'Meta de ganancia mensual',
  description: 'Cerrar el mes en verde',
  targetValue: 1000,
  startDate: '2026-08-01',
  dueDate: '2026-08-31',
}

describe('goalSchema', () => {
  it('caso válido (kind ganancia, sin threshold) pasa; thresholdValue y manualProgress quedan en null', () => {
    const result = goalSchema.safeParse(validGoalBase)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.kind).toBe('ganancia')
    expect(result.data.name).toBe('Meta de ganancia mensual')
    expect(result.data.targetValue).toBe(1000)
    expect(result.data.thresholdValue).toBeNull()
    expect(result.data.manualProgress).toBeNull()
    expect(result.data.startDate).toBe('2026-08-01')
    expect(result.data.dueDate).toBe('2026-08-31')
  })

  it('description ausente se completa con \'\' (default)', () => {
    const { kind, name, targetValue, startDate, dueDate } = validGoalBase
    const result = goalSchema.safeParse({ kind, name, targetValue, startDate, dueDate })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.description).toBe('')
  })

  it('riesgo_diario con thresholdValue válido (>0 y <=100) pasa y conserva el valor', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'riesgo_diario', thresholdValue: 2.5 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.thresholdValue).toBe(2.5)
  })

  it('riesgo_diario SIN thresholdValue falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'riesgo_diario' })
    expect(result.success).toBe(false)
  })

  it('riesgo_diario con thresholdValue fuera de rango (150) falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'riesgo_diario', thresholdValue: 150 })
    expect(result.success).toBe(false)
  })

  it('riesgo_diario con thresholdValue no positivo (0) falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'riesgo_diario', thresholdValue: 0 })
    expect(result.success).toBe(false)
  })

  it('ganancia CON thresholdValue no falla: se fuerza a null (no es un error)', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'ganancia', thresholdValue: 3 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.thresholdValue).toBeNull()
  })

  it('manual con manualProgress válido (0-100) pasa y conserva el valor', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'manual', manualProgress: 60 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.manualProgress).toBe(60)
  })

  it('operaciones CON manualProgress no falla: se fuerza a null (no es un error)', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'operaciones', manualProgress: 40 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.manualProgress).toBeNull()
  })

  it('manualProgress fuera de rango (150) falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'manual', manualProgress: 150 })
    expect(result.success).toBe(false)
  })

  it('startDate > dueDate falla con el mensaje en español esperado', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, startDate: '2026-09-01', dueDate: '2026-08-31' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((i) => i.message === 'La fecha de inicio no puede ser posterior al vencimiento')).toBe(
      true,
    )
  })

  it('startDate === dueDate pasa (límite inclusivo)', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, startDate: '2026-08-15', dueDate: '2026-08-15' })
    expect(result.success).toBe(true)
  })

  it('startDate con fecha calendario inexistente (30 de febrero) falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, startDate: '2026-02-30' })
    expect(result.success).toBe(false)
  })

  it('kind inválido falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, kind: 'inexistente' })
    expect(result.success).toBe(false)
  })

  it('name vacío falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, name: '' })
    expect(result.success).toBe(false)
  })

  it('name de más de 80 caracteres falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, name: 'a'.repeat(81) })
    expect(result.success).toBe(false)
  })

  it('description de más de 500 caracteres falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, description: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })

  it('targetValue no positivo (0) falla', () => {
    const result = goalSchema.safeParse({ ...validGoalBase, targetValue: 0 })
    expect(result.success).toBe(false)
  })

  it('targetValue ausente falla', () => {
    const { kind, name, description, startDate, dueDate } = validGoalBase
    const result = goalSchema.safeParse({ kind, name, description, startDate, dueDate })
    expect(result.success).toBe(false)
  })
})

const validLevel = {
  name: 'Nivel 2',
  goalAmount: 1000,
  minProfitFactor: 1.5,
  minTrades: 20,
  maxDrawdownPct: 10,
}

describe('levelSchema', () => {
  it('caso válido con todos los campos pasa', () => {
    const result = levelSchema.safeParse(validLevel)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.name).toBe('Nivel 2')
    expect(result.data.goalAmount).toBe(1000)
    expect(result.data.minProfitFactor).toBe(1.5)
    expect(result.data.minTrades).toBe(20)
    expect(result.data.maxDrawdownPct).toBe(10)
  })

  it('campos nullable ausentes se completan con null', () => {
    const result = levelSchema.safeParse({ name: 'Nivel 1', goalAmount: 500 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.minProfitFactor).toBeNull()
    expect(result.data.minTrades).toBeNull()
    expect(result.data.maxDrawdownPct).toBeNull()
  })

  it('minTrades 2.5 (no entero) falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, minTrades: 2.5 })
    expect(result.success).toBe(false)
  })

  it('minTrades no positivo (0) falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, minTrades: 0 })
    expect(result.success).toBe(false)
  })

  it('minProfitFactor no positivo (0) falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, minProfitFactor: 0 })
    expect(result.success).toBe(false)
  })

  it('maxDrawdownPct fuera de rango (150) falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, maxDrawdownPct: 150 })
    expect(result.success).toBe(false)
  })

  it('goalAmount no positivo (0) falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, goalAmount: 0 })
    expect(result.success).toBe(false)
  })

  it('goalAmount ausente falla', () => {
    const result = levelSchema.safeParse({ name: 'Nivel 1' })
    expect(result.success).toBe(false)
  })

  it('name vacío falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, name: '' })
    expect(result.success).toBe(false)
  })

  it('name de más de 60 caracteres falla', () => {
    const result = levelSchema.safeParse({ ...validLevel, name: 'a'.repeat(61) })
    expect(result.success).toBe(false)
  })
})

const validFeedback = {
  kind: 'felicitacion' as const,
  title: 'Buen trabajo',
  body: 'Excelente disciplina en tu último trade.',
  tradeId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
}

describe('feedbackSchema', () => {
  it('caso válido con tradeId pasa', () => {
    const result = feedbackSchema.safeParse(validFeedback)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.kind).toBe('felicitacion')
    expect(result.data.tradeId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6')
  })

  it('tradeId ausente se completa con null', () => {
    const { kind, title, body } = validFeedback
    const result = feedbackSchema.safeParse({ kind, title, body })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.tradeId).toBeNull()
  })

  it('tradeId vacío (\'\') se completa con null', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, tradeId: '' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.tradeId).toBeNull()
  })

  it('tradeId no-uuid (\'abc\') falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, tradeId: 'abc' })
    expect(result.success).toBe(false)
  })

  it('kind inválido falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, kind: 'inexistente' })
    expect(result.success).toBe(false)
  })

  it('title vacío falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, title: '' })
    expect(result.success).toBe(false)
  })

  it('title de más de 120 caracteres falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, title: 'a'.repeat(121) })
    expect(result.success).toBe(false)
  })

  it('body vacío falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, body: '' })
    expect(result.success).toBe(false)
  })

  it('body de más de 2000 caracteres falla', () => {
    const result = feedbackSchema.safeParse({ ...validFeedback, body: 'a'.repeat(2001) })
    expect(result.success).toBe(false)
  })
})

describe('inviteSchema', () => {
  it('email válido pasa', () => {
    const result = inviteSchema.safeParse({ email: 'user@mail.com' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.email).toBe('user@mail.com')
  })

  it('email con espacios y mayúsculas se recorta y normaliza a minúsculas', () => {
    const result = inviteSchema.safeParse({ email: '  USER@Mail.com ' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.email).toBe('user@mail.com')
  })

  it('\'not-an-email\' falla', () => {
    const result = inviteSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('email ausente falla', () => {
    const result = inviteSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
