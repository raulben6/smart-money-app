/**
 * Skeleton de `/panel` mientras `PanelPage` (server component async) resuelve
 * `requireMentor` + `loadStudentStats`. Imita la grilla real: 5 tarjetas de
 * métricas agregadas + la tabla de ranking (ver `page.tsx`, `RankingTable`).
 */
export default function PanelLoading() {
  return (
    <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="card animate-pulse" style={{ padding: '16px 17px', height: '92px' }} />
        ))}
      </div>

      <div className="card animate-pulse" style={{ height: '360px' }} aria-hidden="true" />
    </div>
  )
}
