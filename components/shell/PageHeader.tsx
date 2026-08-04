import type { ReactNode } from 'react'

/** Header sticky compartido por las pantallas del shell. Ver mockup línea 68. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 border-b border-neutral-800 px-[30px] py-[18px] backdrop-blur-[8px]"
      style={{
        background: 'linear-gradient(var(--color-bg), color-mix(in oklab, var(--color-bg) 92%, transparent))',
      }}
    >
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h1
          className="m-0 text-[19px] tracking-[-0.015em] text-text"
          style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
        >
          {title}
        </h1>
        {subtitle ? <p className="m-0 text-[12px] text-neutral-400">{subtitle}</p> : null}
      </div>
      {children ? <div className="ml-auto flex items-center gap-[10px]">{children}</div> : null}
    </header>
  )
}
