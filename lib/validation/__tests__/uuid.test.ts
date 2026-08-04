import { describe, it, expect } from 'vitest'
import { isValidUuid } from '../uuid'

describe('isValidUuid', () => {
  it('acepta un UUID v4 válido', () => {
    expect(isValidUuid('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
  })

  it('rechaza un string que no tiene forma de UUID', () => {
    expect(isValidUuid('no-soy-un-uuid')).toBe(false)
  })

  it('rechaza el string vacío', () => {
    expect(isValidUuid('')).toBe(false)
  })

  it('rechaza un id numérico plano', () => {
    expect(isValidUuid('12345')).toBe(false)
  })

  it("rechaza un intento de inyección disfrazado de id ('1; DROP TABLE trades;')", () => {
    expect(isValidUuid('1; DROP TABLE trades;')).toBe(false)
  })
})
