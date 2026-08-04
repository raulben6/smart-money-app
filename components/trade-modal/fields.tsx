import type { ReactNode } from 'react'
import type { TradeFormValues } from '@/lib/validation/trade'

/** Nombre de campo del form del trade — deriva de `TradeFormValues` para no duplicar el esquema. */
export type TradeFieldName = keyof TradeFormValues

/** Estado del formulario del modal: un objeto plano de strings (uno por campo), nunca números/null. */
export type FormState = Record<TradeFieldName, string>

export interface SelectOption {
  value: string
  label: string
}

export interface FieldDef {
  name: TradeFieldName
  label: string
  kind: 'text' | 'select' | 'date' | 'time' | 'number'
  options?: readonly SelectOption[]
  uppercase?: boolean
  required?: boolean
}

/** Errores de un campo (`--neg`, 11px) bajo el input, si los hay — ver mockup 532 (nota) y la resolución del step 5. */
export function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) return null
  return (
    <div className="flex flex-col gap-[2px]">
      {errors.map((msg) => (
        <span key={msg} className="text-neg" style={{ fontSize: '11px' }}>
          {msg}
        </span>
      ))}
    </div>
  )
}

/** Campo genérico del modal: texto, número, fecha, hora o select, según `field.kind`. */
export function FormField({
  field,
  value,
  onChange,
  errors,
}: {
  field: FieldDef
  value: string
  onChange: (value: string) => void
  errors?: string[]
}) {
  const id = `trade-field-${field.name}`
  const inputClassName = `input${field.kind === 'number' ? ' tabular-nums' : ''}${field.uppercase ? ' uppercase' : ''}`

  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}
        {field.required ? ' *' : ''}
      </label>
      {field.kind === 'select' ? (
        <select id={id} name={field.name} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={field.name}
          type={field.kind === 'number' ? 'number' : field.kind}
          step={field.kind === 'number' ? 'any' : undefined}
          className={inputClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <FieldErrors errors={errors} />
    </div>
  )
}

/** Grid `repeat(auto-fit,minmax(150px,1fr))` compartido por Datos/Riesgo/Estrategia (mockup línea 440). */
export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {children}
    </div>
  )
}

/** Título de sección — 11px, mayúsculas, tracking amplio (mockup 439/460/474/489). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[11px] tracking-[0.13em] uppercase text-neutral-500">{children}</h3>
}

function ToggleButton({
  active,
  color,
  label,
  onClick,
}: {
  active: boolean
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex-1 rounded-[7px] border-0 px-[10px] py-[7px] text-[12px]"
      style={{
        background: active ? `color-mix(in oklab, ${color} 18%, transparent)` : 'transparent',
        color: active ? color : 'var(--color-neutral-500)',
      }}
    >
      {label}
    </button>
  )
}

/** Segmentado Long/Short, verde/rojo (mockup 447-453, colores 896-897). */
export function DirectionToggle({ value, onChange }: { value: string; onChange: (value: 'long' | 'short') => void }) {
  return (
    <div className="field">
      <span className="block text-[11px] text-neutral-400" style={{ marginBottom: '5px' }}>
        Dirección
      </span>
      <div
        role="group"
        aria-label="Dirección"
        className="flex gap-[5px] rounded-[9px] p-[3px]"
        style={{ border: '1px solid var(--color-neutral-700)', background: 'var(--color-neutral-800)' }}
      >
        <ToggleButton active={value === 'long'} color="var(--pos)" label="Long" onClick={() => onChange('long')} />
        <ToggleButton active={value === 'short'} color="var(--neg)" label="Short" onClick={() => onChange('short')} />
      </div>
    </div>
  )
}
