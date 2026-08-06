import { describe, it, expect } from 'vitest'
import { relativeTime } from '../format'

const NOW = new Date('2026-08-05T12:00:00.000Z')

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60 * 1000)
}
function hoursAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 3600 * 1000)
}
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 3600 * 1000)
}

describe('relativeTime', () => {
  it('< 60s -> Ahora', () => {
    expect(relativeTime(new Date(NOW.getTime() - 30 * 1000), NOW)).toBe('Ahora')
    expect(relativeTime(NOW, NOW)).toBe('Ahora')
  })

  it('minutos -> Hace N min', () => {
    expect(relativeTime(minutesAgo(1), NOW)).toBe('Hace 1 min')
    expect(relativeTime(minutesAgo(45), NOW)).toBe('Hace 45 min')
  })

  it('horas -> Hace N h', () => {
    expect(relativeTime(hoursAgo(2), NOW)).toBe('Hace 2 h')
    expect(relativeTime(hoursAgo(23), NOW)).toBe('Hace 23 h')
  })

  it('1 día -> Ayer', () => {
    expect(relativeTime(daysAgo(1), NOW)).toBe('Ayer')
  })

  it('días (2-6) -> Hace N días', () => {
    expect(relativeTime(daysAgo(3), NOW)).toBe('Hace 3 días')
    expect(relativeTime(daysAgo(5), NOW)).toBe('Hace 5 días')
  })

  it('semanas -> Hace N semana(s)', () => {
    expect(relativeTime(daysAgo(7), NOW)).toBe('Hace 1 semana')
    expect(relativeTime(daysAgo(20), NOW)).toBe('Hace 2 semanas')
  })

  it('meses -> Hace N mes(es)', () => {
    expect(relativeTime(daysAgo(35), NOW)).toBe('Hace 1 mes')
    expect(relativeTime(daysAgo(70), NOW)).toBe('Hace 2 meses')
  })

  it('acepta un ISO string además de un Date', () => {
    expect(relativeTime(daysAgo(3).toISOString(), NOW)).toBe('Hace 3 días')
  })
})
