/**
 * Card de placeholder para rutas creadas por Task 11 pero cuya UI real construyen las
 * Tasks 12-17 (ver docs/superpowers/plans/2026-08-04-smart-money-fase-2.md). Mismo
 * patrón visual que el estado vacío de `app/(app)/dashboard/page.tsx`.
 */
export function ComingSoonCard({ message }: { message?: string }) {
  return (
    <div className="flex flex-col gap-[22px] px-[30px] pt-[26px] pb-[60px]">
      <div className="card items-center gap-[10px] text-center" style={{ padding: '48px 24px' }}>
        <h2 style={{ margin: 0, fontSize: '16px' }}>Próximamente</h2>
        <p className="m-0 text-[13px] text-neutral-400">
          {message ?? 'Esta sección está en construcción y llegará en una próxima actualización.'}
        </p>
      </div>
    </div>
  )
}
