/** Marca "Smart Trader Performance System" para el sidebar (fondo oscuro en
 *  ambos temas): sello relleno esmeralda con rombo blanco + wordmark, según el
 *  mockup de la migración de tema. */
export function Brand() {
  return (
    <div className="flex items-center gap-[10px] px-2">
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent-fill">
        <div className="h-[9px] w-[9px] rotate-45 rounded-[2px] bg-on-accent" />
      </div>
      <div className="flex flex-col leading-[1.15]">
        <span
          className="text-[13.5px] tracking-[-0.01em] text-text"
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
        >
          Smart Trader
        </span>
        <span className="text-[9px] uppercase tracking-[.14em] text-neutral-500">Performance System</span>
      </div>
    </div>
  )
}
