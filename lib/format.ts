/** Iniciales de `name` para el chip de usuario: 'Andrea Ruiz' -> 'AR', 'Andrea' -> 'AN', '' -> '—'. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
}

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

/**
 * Tiempo relativo en español para el centro de notificaciones (mockup 774-780):
 * relativeTime('2026-08-03T10:00:00Z', now) -> 'Hace 2 h'. `now` se inyecta (NUNCA
 * `new Date()` interno) para mantener la función pura y testeable sin mockear el reloj.
 * Acepta `Date` o un ISO string (lo que llega tal cual de Drizzle/JSON según el caller).
 *
 * Buckets, cada uno con el redondeo hacia abajo del anterior (60 * min no cuentan ya como
 * "hora" hasta cumplir la hora completa, etc.): <60s 'Ahora'; <60min 'Hace N min'; <24h
 * 'Hace N h'; exactamente 1 día 'Ayer' (mismo wording que el mockup, no 'Hace 1 día');
 * 2-6 días 'Hace N días'; <4 semanas 'Hace N semana(s)'; en otro caso 'Hace N mes(es)'
 * (mes ~30 días, aproximado — esta pantalla no necesita precisión calendario exacta).
 */
export function relativeTime(date: string | Date, now: Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000))

  if (diffSec < 60) return 'Ahora'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `Hace ${diffHour} h`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'Ayer'
  if (diffDay < 7) return `Hace ${diffDay} días`
  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 4) return `Hace ${diffWeek} semana${diffWeek === 1 ? '' : 's'}`
  const diffMonth = Math.floor(diffDay / 30)
  return `Hace ${diffMonth} mes${diffMonth === 1 ? '' : 'es'}`
}
