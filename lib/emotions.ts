// Vocabulario cerrado de emociones para la bitácora de trading (antes/durante/después
// de la operación). Cualquier UI de selección (chips, checkboxes) debe consumir este
// mismo vocabulario para mantenerlo en sync con `journalSchema` (lib/validation/trade.ts).
export const EMOTIONS = ['Calma', 'Confianza', 'FOMO', 'Ansiedad', 'Impaciencia', 'Frustración', 'Enfoque'] as const

export type Emotion = (typeof EMOTIONS)[number]

// Fases de la bitácora en las que se registran emociones.
export const PHASES = ['antes', 'durante', 'despues'] as const

export type Phase = (typeof PHASES)[number]
