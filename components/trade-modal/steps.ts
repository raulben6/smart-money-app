import { z } from 'zod'
import { tradeSchema } from '@/lib/validation/trade'
import type { FieldDef, SelectOption } from './fields'

export const MARKET_OPTIONS: readonly SelectOption[] = [
  { value: 'indices', label: 'Índices' },
  { value: 'acciones', label: 'Acciones' },
  { value: 'opciones', label: 'Opciones' },
  { value: 'futuros', label: 'Futuros' },
  { value: 'forex', label: 'Forex' },
  { value: 'cripto', label: 'Cripto' },
]

// El primer valor '' es un placeholder — `timeframe` es texto libre en el esquema (no un
// enum), pero la UI lo restringe a este vocabulario cerrado (resolución del brief).
export const TIMEFRAME_OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'Selecciona…' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: 'D', label: 'D' },
]

export function marketLabel(value: string): string {
  return MARKET_OPTIONS.find((m) => m.value === value)?.label ?? value
}

export const WIZARD_STEPS = ['Datos', 'Riesgo y resultado', 'Estrategia', 'Bitácora'] as const
export const EDIT_TABS = ['Datos', 'Bitácora'] as const

export const DATOS_FIELDS: FieldDef[] = [
  { name: 'asset', label: 'Activo', kind: 'text', uppercase: true, required: true },
  { name: 'market', label: 'Mercado', kind: 'select', options: MARKET_OPTIONS, required: true },
  { name: 'tradeDate', label: 'Fecha', kind: 'date', required: true },
  { name: 'entryTime', label: 'Hora de entrada', kind: 'time' },
  { name: 'exitTime', label: 'Hora de salida', kind: 'time' },
  { name: 'entryPrice', label: 'Precio de entrada', kind: 'number' },
  { name: 'exitPrice', label: 'Precio de salida', kind: 'number' },
  { name: 'contracts', label: 'Contratos', kind: 'number' },
  { name: 'positionSize', label: 'Tamaño de posición', kind: 'number' },
]

export const RIESGO_FIELDS: FieldDef[] = [
  { name: 'stopLoss', label: 'Stop Loss', kind: 'number' },
  { name: 'takeProfit', label: 'Take Profit', kind: 'number' },
  { name: 'riskUsd', label: 'Riesgo en $', kind: 'number' },
  { name: 'riskPct', label: 'Riesgo en %', kind: 'number' },
  { name: 'pnlUsd', label: 'P&L ($)', kind: 'number', required: true },
  { name: 'rMultiple', label: 'R múltiple', kind: 'number' },
]

export const ESTRATEGIA_FIELDS: FieldDef[] = [
  { name: 'setup', label: 'Setup utilizado', kind: 'text' },
  { name: 'timeframe', label: 'Temporalidad', kind: 'select', options: TIMEFRAME_OPTIONS },
  { name: 'marketConditions', label: 'Condiciones del mercado', kind: 'text' },
  { name: 'entryType', label: 'Tipo de entrada', kind: 'text' },
  { name: 'confirmations', label: 'Confirmaciones', kind: 'text' },
]

// Las 3 máscaras particionan exactamente las 21 claves de `tradeSchema` (sin solape, sin
// resto) — el paso 4 (Bitácora) no aporta campos de `trades` todavía (placeholder, Task 14).
export const DATOS_MASK = {
  tradeDate: true,
  asset: true,
  market: true,
  direction: true,
  entryTime: true,
  exitTime: true,
  entryPrice: true,
  exitPrice: true,
  contracts: true,
  positionSize: true,
} as const

export const RIESGO_MASK = {
  stopLoss: true,
  takeProfit: true,
  riskUsd: true,
  riskPct: true,
  pnlUsd: true,
  rMultiple: true,
} as const

export const ESTRATEGIA_MASK = {
  setup: true,
  timeframe: true,
  marketConditions: true,
  entryType: true,
  confirmations: true,
} as const

/**
 * Esquemas por paso (wizard de creación), usados por el botón "Continuar" para validar solo
 * el paso actual. Tipados como `z.ZodType` genérico (no como tupla `as const` de tipos
 * concretos distintos): indexar con un `number` sobre una tupla heterogénea produce una
 * unión de los 3 tipos de esquema en el sitio de uso, y `z.flattenError` no admite un
 * `ZodError` cuya forma sea esa unión (cada rama tiene claves distintas).
 */
export const STEP_SCHEMAS: z.ZodType[] = [
  tradeSchema.pick(DATOS_MASK),
  tradeSchema.pick(RIESGO_MASK),
  tradeSchema.pick(ESTRATEGIA_MASK),
]

/** Paso (0-2) al que pertenece un campo, para saltar ahí si el servidor devuelve un error sobre él; 3 = Bitácora (sin campos de `trades`). */
export function stepForField(name: string): number {
  if (name in DATOS_MASK) return 0
  if (name in RIESGO_MASK) return 1
  if (name in ESTRATEGIA_MASK) return 2
  return 3
}
