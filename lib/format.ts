/** Formatea USD sin decimales, estilo en-US: money(1595) -> '$1,595', money(-180) -> '-$180'. */
export function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Como money, pero siempre antepone signo: signedMoney(420) -> '+$420', signedMoney(-180) -> '-$180'. */
export function signedMoney(n: number): string {
  const sign = n < 0 ? '-' : '+'
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Formatea un número como porcentaje: pct(61.53) -> '62%'. digits: decimales (0 por defecto). */
export function pct(n: number, digits = 0): string {
  return n.toFixed(digits) + '%'
}

export const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export const MONTH_NAMES_ES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/** 'YYYY-MM-DD' de hoy en hora local (nunca toISOString, que puede desplazar el día en zonas negativas). */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 'YYYY-MM-DD' -> 'D mmm' con el mes corto en minúsculas: formatDayMonth('2026-08-03') -> '3 ago'.
 * Cadena vacía -> cadena vacía. Se parsea con split('-') — NUNCA new Date(str), que interpreta
 * el string como UTC y puede desplazar el día en zonas horarias negativas.
 */
export function formatDayMonth(iso: string): string {
  if (!iso) return ''
  const [, month, day] = iso.split('-').map(Number)
  return `${day} ${MONTH_NAMES_ES_SHORT[month - 1].toLowerCase()}`
}

/**
 * 'YYYY-MM-DD' -> 'D de mmmm, AAAA' con el mes completo en minúsculas:
 * formatLongDate('2026-08-03') -> '3 de agosto, 2026'. Si `iso` no tiene forma de fecha ISO
 * (p.ej. cadena vacía mientras el usuario aún no eligió fecha), se devuelve tal cual. Se
 * parsea con split('-') — NUNCA new Date(str).
 */
export function formatLongDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [year, month, day] = iso.split('-').map(Number)
  return `${day} de ${MONTH_NAMES_ES[month - 1].toLowerCase()}, ${year}`
}
