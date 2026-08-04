import { describe, it, expect } from 'vitest'
import { tradeSchema, journalSchema } from '../trade'

const minimalTrade = {
  tradeDate: '2026-08-03',
  asset: 'aapl',
  market: 'acciones',
  direction: 'long',
  pnlUsd: 420.5,
}

describe('tradeSchema', () => {
  it('(a) trade válido mínimo pasa (fecha, activo, mercado, dirección, pnlUsd)', () => {
    const result = tradeSchema.safeParse(minimalTrade)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.tradeDate).toBe('2026-08-03')
    expect(result.data.asset).toBe('AAPL')
    expect(result.data.market).toBe('acciones')
    expect(result.data.direction).toBe('long')
    expect(result.data.pnlUsd).toBe(420.5)
    // Campos numéricos opcionales ausentes -> null; setup/timeframe -> '' por defecto.
    expect(result.data.entryTime).toBeNull()
    expect(result.data.exitTime).toBeNull()
    expect(result.data.entryPrice).toBeNull()
    expect(result.data.riskPct).toBeNull()
    expect(result.data.rMultiple).toBeNull()
    expect(result.data.marketConditions).toBeNull()
    expect(result.data.setup).toBe('')
    expect(result.data.timeframe).toBe('')
  })

  it('(b) tradeDate con mes/día imposibles (2026-13-40) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, tradeDate: '2026-13-40' })
    expect(result.success).toBe(false)
  })

  it('(b2) tradeDate con formato correcto pero fecha calendario inexistente (30 de febrero) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, tradeDate: '2026-02-30' })
    expect(result.success).toBe(false)
  })

  it('(b3) tradeDate con formato inválido (no coincide con el regex) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, tradeDate: '08/03/2026' })
    expect(result.success).toBe(false)
  })

  it('(c) asset vacío falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, asset: '' })
    expect(result.success).toBe(false)
  })

  it('(c2) asset de solo espacios falla (queda vacío tras trim)', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, asset: '   ' })
    expect(result.success).toBe(false)
  })

  it('(c3) asset de más de 20 caracteres (tras trim) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, asset: 'a'.repeat(21) })
    expect(result.success).toBe(false)
  })

  it('asset se recorta (trim) y se convierte a mayúsculas', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, asset: '  spy  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.asset).toBe('SPY')
  })

  it('(d) riskPct fuera de rango (150) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, riskPct: 150 })
    expect(result.success).toBe(false)
  })

  it('(d2) riskPct negativo falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, riskPct: -1 })
    expect(result.success).toBe(false)
  })

  it('(d3) riskPct dentro de rango (0-100) pasa', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, riskPct: 2.5 })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.riskPct).toBe(2.5)
  })

  it('(f) strings numéricos del form (\'420.50\') se coercionan a número', () => {
    const result = tradeSchema.safeParse({
      tradeDate: '2026-08-03',
      asset: 'AAPL',
      market: 'acciones',
      direction: 'long',
      pnlUsd: '420.50',
      entryPrice: '150.25',
      riskPct: '2.5',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.pnlUsd).toBe(420.5)
    expect(result.data.entryPrice).toBe(150.25)
    expect(result.data.riskPct).toBe(2.5)
  })

  it('campos numéricos opcionales: string vacío del form se convierte en null (no NaN)', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, entryPrice: '', riskPct: '', rMultiple: undefined })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.entryPrice).toBeNull()
    expect(result.data.riskPct).toBeNull()
    expect(result.data.rMultiple).toBeNull()
    expect(Number.isNaN(result.data.entryPrice)).toBe(false)
  })

  it('entryTime/exitTime con formato inválido falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, entryTime: '9:5' })
    expect(result.success).toBe(false)
  })

  it('entryTime con formato HH:mm válido (24h) pasa', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, entryTime: '09:05', exitTime: '23:59' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.entryTime).toBe('09:05')
    expect(result.data.exitTime).toBe('23:59')
  })

  it('exitTime fuera de rango 24h (25:00) falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, exitTime: '25:00' })
    expect(result.success).toBe(false)
  })

  it('market inválido falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, market: 'bonos' })
    expect(result.success).toBe(false)
  })

  it('direction inválida falla', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, direction: 'sideways' })
    expect(result.success).toBe(false)
  })

  it('setup y timeframe respetan sus longitudes máximas (120 / 20)', () => {
    const tooLongSetup = tradeSchema.safeParse({ ...minimalTrade, setup: 'a'.repeat(121) })
    expect(tooLongSetup.success).toBe(false)
    const tooLongTimeframe = tradeSchema.safeParse({ ...minimalTrade, timeframe: 'a'.repeat(21) })
    expect(tooLongTimeframe.success).toBe(false)
  })

  it('campos de texto libre de estrategia (marketConditions/entryType/confirmations) respetan max 500', () => {
    const result = tradeSchema.safeParse({ ...minimalTrade, marketConditions: 'a'.repeat(501) })
    expect(result.success).toBe(false)
  })
})

describe('journalSchema', () => {
  const minimalJournal = {
    emotions: { antes: ['Calma'], durante: [], despues: ['Confianza'] },
  }

  it('journal válido mínimo pasa; los textos ausentes se completan con \'\'', () => {
    const result = journalSchema.safeParse(minimalJournal)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.whyTook).toBe('')
    expect(result.data.emotions.antes).toEqual(['Calma'])
    expect(result.data.emotions.despues).toEqual(['Confianza'])
  })

  it('(e) journal con emoción fuera del vocabulario (\'Euforia\') falla', () => {
    const result = journalSchema.safeParse({ emotions: { antes: ['Euforia'], durante: [], despues: [] } })
    expect(result.success).toBe(false)
  })

  it('emociones ausentes en alguna fase se completan con []', () => {
    const result = journalSchema.safeParse({ emotions: { antes: ['FOMO'] } })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.emotions.durante).toEqual([])
    expect(result.data.emotions.despues).toEqual([])
  })

  it('emotions completamente ausente se completa con arreglos vacíos en las 3 fases', () => {
    const result = journalSchema.safeParse({})
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.emotions).toEqual({ antes: [], durante: [], despues: [] })
  })

  it('improve con más de 2000 caracteres falla', () => {
    const result = journalSchema.safeParse({ ...minimalJournal, improve: 'a'.repeat(2001) })
    expect(result.success).toBe(false)
  })
})
