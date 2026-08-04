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
