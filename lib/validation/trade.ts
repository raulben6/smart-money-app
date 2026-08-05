import '@/lib/validation/zod-config'
import { z } from 'zod'
import { EMOTIONS } from '@/lib/emotions'

// Deben mantenerse en sync con los enums de Postgres definidos en lib/db/schema.ts
// (marketEnum, directionEnum). No se importa el módulo de DB aquí para mantener este
// módulo de validación independiente de la capa de datos (puede usarse en el cliente).
const MARKETS = ['indices', 'acciones', 'opciones', 'futuros', 'forex', 'cripto'] as const
const DIRECTIONS = ['long', 'short'] as const

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** true si (y, m, d) forma una fecha calendario real (rechaza p.ej. mes 13 o 30 de febrero). */
function isRealDate(y: number, m: number, d: number): boolean {
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/**
 * Fecha AAAA-MM-DD con regex + validación de calendario real (rechaza 30 de febrero, etc.).
 * Exportado como `isoDateSchema` para reutilizarse en otros módulos de validación
 * (p. ej. `lib/validation/mentor.ts`) sin duplicar la lógica de `isRealDate`.
 */
export const isoDateSchema = z
  .string()
  .regex(DATE_RE, 'Fecha inválida, use el formato AAAA-MM-DD')
  .refine((val) => {
    const [y, m, d] = val.split('-').map(Number)
    return isRealDate(y, m, d)
  }, 'Fecha inválida')

// Recorta espacios y convierte a mayúsculas antes de validar la longitud (1-20).
const asset = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().min(1, 'El activo es obligatorio').max(20, 'Máximo 20 caracteres'))

/**
 * '' / undefined / null del form -> null; cualquier otro valor pasa a `inner` (nunca NaN).
 * Exportado para reutilizarse en otros módulos de validación (p. ej. `mentor.ts`), tanto
 * para campos numéricos (`optionalNumber`) como para otros tipos nullable (p. ej. un uuid
 * opcional: `nullableOn(z.uuid())`).
 */
export function nullableOn<T extends z.ZodType>(inner: T) {
  return z.preprocess((val) => (val === '' || val === undefined || val === null ? null : val), inner.nullable())
}

/** Numérico opcional: coerciona strings del form a número; ausente/'' -> null. */
export function optionalNumber(build: (n: z.ZodNumber) => z.ZodNumber = (n) => n) {
  return nullableOn(build(z.coerce.number()))
}

/**
 * Numérico requerido: a diferencia de `optionalNumber`, aquí "sin dato" no es un valor
 * válido (no existe `null`). '' / solo espacios / ausente / null añaden un issue custom
 * con `requiredMessage` en español y cortan el pipeline (`ctx.addIssue` + `z.NEVER`, ver
 * `handlePipeResult` en zod: si el paso de preprocesamiento deja issues, no se ejecuta el
 * schema numérico interno, evitando un segundo issue duplicado de "NaN"). `0` explícito y
 * negativos son valores legítimos (p.ej. breakeven o pérdida) y pasan. Strings no numéricos
 * (p.ej. 'abc') siguen fallando con el mensaje por defecto del locale global, ya que no se
 * consideran "vacíos" y sí llegan a `z.coerce.number()`.
 *
 * `build` permite encadenar restricciones adicionales (p. ej. `.positive(...)`) sobre el
 * `z.coerce.number()` interno, igual que en `optionalNumber`; por defecto es la identidad
 * para no alterar el comportamiento de los llamadores existentes (p.ej. `pnlUsd`).
 */
export function requiredNumber(requiredMessage: string, build: (n: z.ZodNumber) => z.ZodNumber = (n) => n) {
  return z.preprocess((val, ctx) => {
    const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '')
    if (isEmpty) {
      ctx.addIssue(requiredMessage)
      return z.NEVER
    }
    return val
  }, build(z.coerce.number()))
}

/** Hora HH:mm (24h) opcional; ausente/'' -> null. */
function optionalTime() {
  return nullableOn(z.string().regex(TIME_RE, 'Hora inválida, use el formato HH:mm'))
}

/** Texto libre opcional con longitud máxima; ausente/'' -> null. */
function optionalText(max: number) {
  return nullableOn(z.string().max(max, `Máximo ${max} caracteres`))
}

export const tradeSchema = z.object({
  tradeDate: isoDateSchema,
  asset,
  market: z.enum(MARKETS, 'Mercado inválido'),
  direction: z.enum(DIRECTIONS, 'Dirección inválida'),
  entryTime: optionalTime(),
  exitTime: optionalTime(),
  entryPrice: optionalNumber(),
  exitPrice: optionalNumber(),
  contracts: optionalNumber(),
  positionSize: optionalNumber(),
  stopLoss: optionalNumber(),
  takeProfit: optionalNumber(),
  riskUsd: optionalNumber(),
  riskPct: optionalNumber((n) =>
    n.min(0, 'Debe ser mayor o igual a 0').max(100, 'Debe ser menor o igual a 100'),
  ),
  pnlUsd: requiredNumber('El P&L es obligatorio'),
  rMultiple: optionalNumber(),
  setup: z.string().max(120, 'Máximo 120 caracteres').default(''),
  timeframe: z.string().max(20, 'Máximo 20 caracteres').default(''),
  marketConditions: optionalText(500),
  entryType: optionalText(500),
  confirmations: optionalText(500),
})

export type TradeFormValues = z.infer<typeof tradeSchema>

// Cada arreglo de fase acepta únicamente emociones del vocabulario cerrado (lib/emotions.ts);
// si la fase no viene en el input, se completa con [].
const emotionsArray = z.array(z.enum(EMOTIONS, 'Emoción no reconocida')).default([])

const emotionsSchema = z
  .object({
    antes: emotionsArray,
    durante: emotionsArray,
    despues: emotionsArray,
  })
  .default({ antes: [], durante: [], despues: [] })

const journalText = z.string().max(2000, 'Máximo 2000 caracteres').default('')

export const journalSchema = z.object({
  whyTook: journalText,
  whatSaw: journalText,
  followedPlan: journalText,
  didWell: journalText,
  didWrong: journalText,
  improve: journalText,
  emotions: emotionsSchema,
})

export type JournalFormValues = z.infer<typeof journalSchema>
