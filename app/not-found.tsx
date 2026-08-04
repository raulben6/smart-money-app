import Link from 'next/link'

/** 404 global — cubre cualquier ruta inexistente en cualquier grupo del árbol. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card elev-md w-full max-w-sm items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
        <h1 style={{ margin: 0, fontSize: '19px' }}>Página no encontrada</h1>
        <p className="m-0 text-[13px] text-neutral-400">
          La página que buscas no existe o fue movida.
        </p>
        <Link href="/dashboard" className="btn btn-ghost" style={{ marginTop: '8px' }}>
          Volver al dashboard
        </Link>
      </div>
    </main>
  )
}
