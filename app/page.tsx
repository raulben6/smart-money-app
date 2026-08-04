export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="card w-full max-w-sm elev-sm">
        <span className="tag tag-outline">Nocturne</span>
        <h1 className="card-title">Smart Money App</h1>
        <p className="text-neutral-400">
          Página temporal para verificar los tokens del sistema de diseño Nocturne.
        </p>
        <button type="button" className="btn btn-primary">
          Verificar tokens
        </button>
      </div>
    </main>
  )
}
