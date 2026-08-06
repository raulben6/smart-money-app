'use client'

import { useEffect } from 'react'

/**
 * Error boundary del grupo `(mentor)` (panel, comparador, estudiantes/[id], etc.).
 * Captura errores de las páginas y sus componentes hijos, pero no del propio
 * `layout.tsx` del grupo (p.ej. si `requireMentor()` falla ahí) — esos los cubre el
 * boundary raíz en `app/error.tsx`.
 */
export default function MentorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card elev-md w-full max-w-sm items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
        <h1 style={{ margin: 0, fontSize: '19px' }}>Algo salió mal</h1>
        <p className="m-0 text-[13px] text-neutral-400">
          Ocurrió un error inesperado al cargar esta página. Puedes intentarlo de nuevo.
        </p>
        <button type="button" onClick={() => reset()} className="btn btn-secondary" style={{ marginTop: '8px' }}>
          Reintentar
        </button>
      </div>
    </main>
  )
}
