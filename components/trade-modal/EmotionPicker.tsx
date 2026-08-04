'use client'

import { EMOTIONS, PHASES, type Emotion, type Phase } from '@/lib/emotions'
import type { JournalFormValues } from '@/lib/validation/trade'

/** Forma del campo `emotions` del journal — un array (subconjunto de `EMOTIONS`) por fase. */
export type EmotionsValue = JournalFormValues['emotions']

const PHASE_LABELS: Record<Phase, string> = {
  antes: 'Antes',
  durante: 'Durante',
  despues: 'Después',
}

/**
 * 3 filas (Antes/Durante/Después, mockup 494-500) de chips toggle con las 7 emociones
 * del vocabulario cerrado (`lib/emotions.ts`). Cada chip es un `<button aria-pressed>`
 * (no un `<div>`/checkbox oculto) para que el estado on/off sea anunciado por lectores
 * de pantalla sin depender de estilos. Estilo exacto del mockup 715-728: borde+fondo+texto
 * de acento cuando está activo, `--color-neutral-700`/transparent/`--color-neutral-400`
 * en reposo.
 */
export function EmotionPicker({ value, onChange }: { value: EmotionsValue; onChange: (value: EmotionsValue) => void }) {
  function toggle(phase: Phase, emotion: Emotion) {
    const current = value[phase]
    const next = current.includes(emotion) ? current.filter((e) => e !== emotion) : [...current, emotion]
    onChange({ ...value, [phase]: next })
  }

  return (
    <div className="flex flex-col gap-[9px]">
      {PHASES.map((phase) => (
        <div key={phase} className="flex flex-wrap items-center gap-[10px]">
          <span className="w-[70px] flex-none text-[11px] text-neutral-500">{PHASE_LABELS[phase]}</span>
          {EMOTIONS.map((emotion) => {
            const active = value[phase].includes(emotion)
            return (
              <button
                key={emotion}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(phase, emotion)}
                className="rounded-[20px] px-[11px] py-[5px] text-[11.5px]"
                style={{
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-neutral-700)'}`,
                  background: active ? 'var(--color-accent-900)' : 'transparent',
                  color: active ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
                  transition: 'all .15s',
                }}
              >
                {emotion}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
