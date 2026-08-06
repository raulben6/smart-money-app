import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { esES } from '@clerk/localizations'
import { BRAND_FILL } from '@/lib/brand'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Smart Trader Performance System',
  description: 'Diario de trading con mentoría',
}

/* Estampa data-theme ANTES del primer paint (evita el destello de tema):
   preferencia guardada ('theme' en localStorage) o, si no hay, la del sistema.
   Si el script falla, el CSS cae al tema oscuro (base de :root). */
const themeInitScript = `var t=null;try{t=localStorage.getItem('theme')}catch(e){}if(t!=='light'&&t!=='dark'){try{t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){t='dark'}}document.documentElement.dataset.theme=t`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {/* El tema de Clerk sigue el color-scheme del CSS (claro/oscuro
            automático); solo se fija el acento de marca. El login pina su
            propia apariencia en las páginas de (auth). */}
        <ClerkProvider
          localization={esES}
          appearance={{
            variables: {
              colorPrimary: BRAND_FILL,
              borderRadius: '8px',
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
