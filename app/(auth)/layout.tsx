import Image from 'next/image'
import { Brand } from '@/components/shell/Brand'
import authBg from './auth-bg.jpg'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh">
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
          <div className="flex flex-col items-center gap-[6px]">
            <Brand />
            <p className="m-0 text-[12.5px] text-neutral-300">Diario de trading con mentoría</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
