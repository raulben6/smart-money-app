import Image from 'next/image'
import authBg from './auth-bg.jpg'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // .nocturne-violet congela aquí la paleta original: el login no sigue el
    // tema claro/oscuro de la app (decisión del usuario en la migración).
    <div className="nocturne-violet relative min-h-dvh">
      <Image
        src={authBg}
        alt=""
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="object-cover"
      />
      {/* Velo sobre la foto: garantiza el contraste de marca y tarjeta con cualquier zona de la imagen. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 130% 95% at 50% 42%,
              color-mix(in srgb, var(--color-bg) 45%, transparent),
              color-mix(in srgb, var(--color-bg) 90%, transparent)),
            linear-gradient(to bottom,
              color-mix(in srgb, var(--color-bg) 50%, transparent),
              color-mix(in srgb, var(--color-bg) 26%, transparent) 42%,
              color-mix(in srgb, var(--color-bg) 68%, transparent))`,
        }}
      />
      <div className="relative grid min-h-dvh place-items-center p-6">
        <div className="flex w-full flex-col items-center gap-[22px]">
          {/* Marca tipográfica pura (propuesta A elegida por el usuario 2026-08-06). */}
          <div className="flex flex-col items-center gap-[10px] text-center">
            <span
              className="text-[21px] uppercase tracking-[0.3em] text-text"
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--font-heading-weight)' }}
            >
              Smart Trader
            </span>
            <span aria-hidden className="h-px w-[46px] bg-accent" />
            <span className="text-[10px] uppercase tracking-[0.42em] text-accent-300">Performance System</span>
            <p className="m-0 mt-[2px] text-[12px] text-neutral-400">Diario de trading con mentoría</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
