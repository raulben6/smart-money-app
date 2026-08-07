/**
 * Zona horaria del programa: el mentor y sus estudiantes operan en
 * Centroamérica (UTC-6, sin horario de verano). El servidor de producción
 * corre en UTC, así que todo cálculo de calendario del lado servidor ("hoy",
 * los límites de un día para filtros) debe anclarse a este offset — nunca a la
 * hora local del proceso, que en producción desplaza todo 6 horas (bug del
 * smoke-test ronda 13: los comentarios del mentor enviados por la tarde caían
 * "al día siguiente" para los filtros). Si el programa se internacionaliza,
 * esto pasa a ser un offset por usuario.
 */
export const APP_UTC_OFFSET = '-06:00'

const APP_UTC_OFFSET_MS = -6 * 60 * 60 * 1000

/**
 * Fecha 'YYYY-MM-DD' de HOY en la zona del programa — determinista en
 * cualquier servidor. Para código que corre en el NAVEGADOR (formularios),
 * `todayLocalISO()` de lib/format sigue siendo lo correcto (hora del usuario).
 */
export function todayAppISO(): string {
  return new Date(Date.now() + APP_UTC_OFFSET_MS).toISOString().slice(0, 10)
}
