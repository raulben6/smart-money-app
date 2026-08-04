'use client'

import { useEffect } from 'react'

/**
 * Error boundary raíz: cubre todo lo que queda fuera de `(app)` — el árbol
 * de `(auth)` (sign-in/sign-up), `app/onboarding` y `app/page.tsx` — más
 * cualquier error del propio `app/(app)/layout.tsx` (que su boundary local
 * no puede capturar). No necesita `<html>`/`<body>`: eso solo lo exige
 * `global-error.tsx`, que sustituye el layout raíz.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card elev-md w-full max-w-sm items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
        <h1 style={{ margin: 0, fontSize: '19px' }}>Algo salió mal</h1>
        <p className="m-0 text-[13px] text-neutral-400">
          Ocurrió un error inesperado. Puedes intentarlo de nuevo.
        </p>
        <button type="button" onClick={() => reset()} className="btn btn-secondary" style={{ marginTop: '8px' }}>
          Reintentar
        </button>
      </div>
    </main>
  )
}
