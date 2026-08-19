const WEEK_ROWS = 5

/**
 * Skeleton del calendario mientras `CalendarioPage` resuelve. Imita la
 * grilla real: header de mes (nav + label), grid de 7 columnas (`MonthGrid`)
 * y 4 tarjetas de resumen (`MonthSummary`, ver `page.tsx`).
 */
export default function CalendarioLoading() {
  return (
    <div className="flex flex-col gap-[22px] px-4 sm:px-[30px] pt-[26px] pb-[60px]" aria-busy="true">
      <span className="sr-only">Cargando…</span>

      <div className="flex items-center gap-[8px]" aria-hidden="true">
        <div className="card animate-pulse" style={{ width: '30px', height: '30px', padding: 0 }} />
        <div className="card animate-pulse" style={{ width: '150px', height: '24px', padding: 0 }} />
        <div className="card animate-pulse" style={{ width: '30px', height: '30px', padding: 0 }} />
      </div>

      <div className="grid grid-cols-7 gap-[7px]" aria-hidden="true">
        {Array.from({ length: 7 * WEEK_ROWS }, (_, i) => (
          <div key={i} className="card animate-pulse min-h-[52px] sm:min-h-[92px]" />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card animate-pulse" style={{ height: '64px' }} />
        ))}
      </div>
    </div>
  )
}
