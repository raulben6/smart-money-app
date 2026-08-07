/**
 * Skeleton de `/comparador` mientras `ComparadorPage` (server component async)
 * resuelve `requireMentor` + `loadStudentStats`. Imita la grilla real: los chips
 * de selección (`CompareChips`) + las filas de métricas (`CompareBars`, ver
 * `page.tsx`).
 */
export default function ComparadorLoading() {
  return (
    <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card animate-pulse" style={{ width: '90px', height: '30px', borderRadius: '20px', padding: 0 }} />
        ))}
      </div>

      <div className="card animate-pulse" style={{ height: '420px' }} aria-hidden="true" />
    </div>
  )
}
