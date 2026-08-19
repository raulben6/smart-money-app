/**
 * Skeleton del dashboard mientras `DashboardPage` (server component async)
 * resuelve `requireUser` + `listTrades`. Imita la grilla real: 4 tarjetas
 * hero + 2 filas de 2 tarjetas (ver `page.tsx`).
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 17px', height: '92px' }} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]" aria-hidden="true">
        <div className="card animate-pulse" style={{ height: '300px' }} />
        <div className="card animate-pulse" style={{ height: '300px' }} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" aria-hidden="true">
        <div className="card animate-pulse" style={{ height: '220px' }} />
        <div className="card animate-pulse" style={{ height: '220px' }} />
      </div>
    </div>
  )
}
