'use client'

import { useEffect, useId, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'

// Deben coincidir exactamente con las reglas del servidor (lib/actions/captures.ts) —
// el chequeo de aquí es solo UX (feedback inmediato); el servidor sigue siendo la
// autoridad y revalida ambas reglas por su cuenta.
const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp'])
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024
const FORMATO_INVALIDO = 'Formato no permitido (PNG, JPG o WebP)'
const TAMANO_INVALIDO = 'La captura no puede superar 5 MB'

export interface CaptureSlotProps {
  phase: 'before' | 'after'
  label: string
  /**
   * `v` es un valor de cache-busting que el padre recalcula (p. ej. `Date.now()`) en cada
   * subida exitosa para esta fase — no solo al montar. Es necesario porque una re-subida
   * reemplaza la fila por `tradeId`+`phase` sin cambiar su `id` (`upsertCapture` hace
   * `onConflictDoUpdate`), así que sin un `v` que cambie en cada subida el cache del
   * navegador/CDN de `get()` podría seguir sirviendo los bytes de la imagen anterior bajo
   * la misma URL `/api/captures/{id}` (nota del review de Task 9).
   */
  existing?: { id: string; v: number }
  pendingFile?: File
  onSelect: (file: File) => void
  onDelete: () => void
  /** true mientras una subida o un borrado están en curso — deshabilita la zona (modo editar). */
  busy?: boolean
  /** Error del servidor (subida/borrado) a mostrar junto al de validación local, si lo hay. */
  error?: string
}

/**
 * Zona de captura (mockup 508-521): borde punteado, drag&drop + `<input type="file">`
 * accesible vía `<label htmlFor>` (oculto con `sr-only`, no `display:none` — sigue en el
 * orden de tabulación y Enter/Espacio abre el selector nativo). Valida tipo/tamaño en
 * cliente con los mismos mensajes que el servidor antes de avisar al padre vía
 * `onSelect`; el padre decide si sube de inmediato (modo editar) o solo guarda el `File`
 * en memoria (modo crear) — este componente no llama a ningún Server Action.
 *
 * Preview: un `pendingFile` (aún no subido) usa `URL.createObjectURL` (se libera al
 * cambiar de archivo o desmontar); una captura ya subida usa `/api/captures/{id}?v={existing.v}`
 * — ver el doc de `existing` sobre por qué `v` es necesario para evitar bytes viejos del
 * cache tras una re-subida (nota del review de Task 9).
 */
export function CaptureSlot({ phase, label, existing, pendingFile, onSelect, onDelete, busy, error }: CaptureSlotProps) {
  const inputId = useId()
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  // Derivado directamente de `pendingFile` en el propio render, no vía setState dentro de
  // un efecto (regla `react-hooks/set-state-in-effect`, cascading renders): `URL.createObjectURL`
  // es barato y determinista para un mismo `File`, así que `useMemo` alcanza. El efecto de
  // abajo solo libera el objeto URL anterior (side-effect puro de limpieza, sin setState).
  const previewUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile])

  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function validate(file: File): string | null {
    if (!TIPOS_PERMITIDOS.has(file.type)) return FORMATO_INVALIDO
    if (file.size > TAMANO_MAXIMO_BYTES) return TAMANO_INVALIDO
    return null
  }

  function handleFile(file: File | null | undefined) {
    if (!file || busy) return
    const err = validate(file)
    if (err) {
      setLocalError(err)
      return
    }
    setLocalError(null)
    onSelect(file)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0])
    // Permite volver a seleccionar el mismo archivo (p. ej. tras un error) — sin esto,
    // el navegador no dispara `onChange` una segunda vez para un valor idéntico.
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const shownError = localError ?? error ?? null
  const imageSrc = previewUrl ?? (existing ? `/api/captures/${existing.id}?v=${existing.v}` : null)

  return (
    <div className="flex flex-col gap-[6px]">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-busy={busy || undefined}
        className="relative flex h-[150px] flex-col items-center justify-center gap-[6px] overflow-hidden rounded-[10px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-accent)]"
        style={{
          border: `1px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-neutral-700)'}`,
          background: 'var(--color-neutral-800)',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <input
          id={inputId}
          name={phase}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={handleInputChange}
        />
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- captura privada autenticada, no un asset estático de next/image
          <img src={imageSrc} alt={label} className="h-full w-full object-cover" />
        ) : (
          <>
            <span className="text-[12px] text-neutral-400">{label}</span>
            <span className="text-[11px] text-neutral-500">Arrastra la captura del gráfico</span>
          </>
        )}
      </label>
      {imageSrc && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="btn btn-ghost self-start text-[11px]"
          style={{ color: 'var(--neg)' }}
        >
          Eliminar
        </button>
      )}
      {shownError && (
        <span role="alert" className="text-neg" style={{ fontSize: '11px' }}>
          {shownError}
        </span>
      )}
    </div>
  )
}
