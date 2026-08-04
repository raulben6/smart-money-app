/** Marca "Smart Money App": rombo con glow de acento + wordmark. Ver mockup líneas 28-36. */
export function Brand() {
  return (
    <div className="flex items-center gap-[10px] px-2">
      <div
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border border-accent"
        style={{ boxShadow: '0 0 14px -4px var(--color-accent)' }}
      >
        <div className="h-2 w-2 rotate-45 rounded-[2px] bg-accent" />
      </div>
      <div className="flex flex-col leading-[1.15]">
        <span
          className="text-[13.5px] tracking-[-0.01em] text-text"
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
        >
          Smart Money
        </span>
        <span className="text-[10px] uppercase tracking-[.12em] text-neutral-400">App</span>
      </div>
    </div>
  )
}
