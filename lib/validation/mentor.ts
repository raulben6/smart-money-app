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
    // Solo tiene sentido para kind 'riesgo_diario'; para cualquier otro kind se fuerza a
    // null en el `.transform` de abajo (un valor recibido en, p.ej., 'ganancia' NO es un
    // error, simplemente se descarta).
    thresholdValue: optionalNumber((n) => n.positive(POSITIVE_MSG).max(100, MAX_100_MSG)),
    // Solo tiene sentido para kind 'manual'; mismo criterio de "forzar a null" que thresholdValue.
    manualProgress: optionalNumber((n) => n.min(0, 'Debe ser mayor o igual a 0').max(100, MAX_100_MSG)),
    startDate: isoDateSchema,
    dueDate: isoDateSchema,
  })
  // Comparación lexicográfica de strings AAAA-MM-DD == comparación cronológica.
  .refine((data) => data.startDate <= data.dueDate, {
    message: 'La fecha de inicio no puede ser posterior al vencimiento',
    path: ['dueDate'],
  })
  // `thresholdValue` es el único campo cuya ausencia depende de `kind`: se exige (>0 y
  // <=100, ya validado arriba) únicamente cuando kind === 'riesgo_diario'. No usamos
  // `requiredNumber` aquí porque la "obligatoriedad" depende de otro campo del objeto, no
  // solo del propio valor.
  .superRefine((data, ctx) => {
    if (data.kind === 'riesgo_diario' && data.thresholdValue === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'El umbral es obligatorio para objetivos de riesgo diario',
        path: ['thresholdValue'],
      })
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
