import '@/lib/validation/zod-config'
import { z } from 'zod'
import { isoDateSchema, nullableOn, optionalNumber, requiredNumber } from '@/lib/validation/trade'

// Deben mantenerse en sync con los enums de Postgres definidos en lib/db/schema.ts
// (goalKindEnum, notificationKindEnum). No se importa el módulo de DB aquí para mantener
// este módulo de validación independiente de la capa de datos (puede usarse en el cliente).
const GOAL_KINDS = ['ganancia', 'operaciones', 'win_rate', 'riesgo_diario', 'manual'] as const
const NOTIFICATION_KINDS = ['felicitacion', 'correccion', 'recordatorio', 'observacion', 'progreso'] as const

const POSITIVE_MSG = 'Debe ser mayor que 0'
const MAX_100_MSG = 'Debe ser menor o igual a 100'

export const goalSchema = z
  .object({
    kind: z.enum(GOAL_KINDS, 'Tipo de objetivo inválido'),
    name: z.string().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
    description: z.string().max(500, 'Máximo 500 caracteres').default(''),
    targetValue: requiredNumber('El valor objetivo es obligatorio', (n) => n.positive(POSITIVE_MSG)),
    // Sin restricciones de rango a nivel de campo: tanto la obligatoriedad como el rango
    // (>0, <=100) SOLO aplican cuando kind === 'riesgo_diario' (ver `.superRefine` abajo).
    // Si se aplicaran aquí (p.ej. `.max(100)`), un valor fuera de rango en, digamos,
    // 'ganancia' fallaría la validación ANTES de llegar al `.transform` que lo descarta —
    // justo el bug que este comentario documenta haber evitado.
    thresholdValue: optionalNumber(),
    // Mismo criterio que thresholdValue: el rango (0-100) solo aplica cuando kind === 'manual'.
    manualProgress: optionalNumber(),
    startDate: isoDateSchema,
    dueDate: isoDateSchema,
  })
  // Comparación lexicográfica de strings AAAA-MM-DD == comparación cronológica.
  .refine((data) => data.startDate <= data.dueDate, {
    message: 'La fecha de inicio no puede ser posterior al vencimiento',
    path: ['dueDate'],
  })
  // thresholdValue/manualProgress son los únicos campos cuya obligatoriedad Y rango
  // dependen de `kind`: no usamos `requiredNumber`/`optionalNumber` con builder para esto
  // porque la validación depende de OTRO campo del objeto, no solo del propio valor. Un
  // valor fuera de rango en un kind donde el campo NO aplica no entra aquí (no se valida,
  // ver el `.transform` de abajo que lo descarta sin error).
  .superRefine((data, ctx) => {
    if (data.kind === 'riesgo_diario') {
      if (data.thresholdValue === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'El umbral es obligatorio para objetivos de riesgo diario',
          path: ['thresholdValue'],
        })
      } else {
        if (data.thresholdValue <= 0) {
          ctx.addIssue({ code: 'custom', message: POSITIVE_MSG, path: ['thresholdValue'] })
        }
        if (data.thresholdValue > 100) {
          ctx.addIssue({ code: 'custom', message: MAX_100_MSG, path: ['thresholdValue'] })
        }
      }
    }
    if (data.kind === 'manual' && data.manualProgress !== null) {
      if (data.manualProgress < 0) {
        ctx.addIssue({ code: 'custom', message: 'Debe ser mayor o igual a 0', path: ['manualProgress'] })
      }
      if (data.manualProgress > 100) {
        ctx.addIssue({ code: 'custom', message: MAX_100_MSG, path: ['manualProgress'] })
      }
    }
  })
  // Fuerza a null los campos que no aplican al kind seleccionado (ver comentarios arriba).
  .transform((data) => ({
    ...data,
    thresholdValue: data.kind === 'riesgo_diario' ? data.thresholdValue : null,
    manualProgress: data.kind === 'manual' ? data.manualProgress : null,
  }))

export type GoalFormValues = z.infer<typeof goalSchema>

export const levelSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(60, 'Máximo 60 caracteres'),
  goalAmount: requiredNumber('El monto objetivo es obligatorio', (n) => n.positive(POSITIVE_MSG)),
  minProfitFactor: optionalNumber((n) => n.positive(POSITIVE_MSG)),
  minTrades: optionalNumber((n) => n.int('Debe ser un número entero').positive(POSITIVE_MSG)),
  maxDrawdownPct: optionalNumber((n) => n.positive(POSITIVE_MSG).max(100, MAX_100_MSG)),
})

export type LevelFormValues = z.infer<typeof levelSchema>

export const feedbackSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS, 'Tipo de notificación inválido'),
  title: z.string().min(1, 'El título es obligatorio').max(120, 'Máximo 120 caracteres'),
  body: z.string().min(1, 'El mensaje es obligatorio').max(2000, 'Máximo 2000 caracteres'),
  // '' / ausente / null -> null; cualquier otro valor debe tener forma de uuid válido.
  tradeId: nullableOn(z.uuid('Identificador de operación inválido')),
})

export type FeedbackFormValues = z.infer<typeof feedbackSchema>

export const inviteSchema = z.object({
  // Se recorta y normaliza a minúsculas ANTES de validar el formato, así
  // '  USER@Mail.com ' pasa como 'user@mail.com' en vez de fallar por los espacios.
  email: z.string().trim().toLowerCase().pipe(z.email('Correo electrónico inválido')),
})

export type InviteFormValues = z.infer<typeof inviteSchema>
