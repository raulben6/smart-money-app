import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { esES } from '@clerk/localizations'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Smart Trader Performance System',
  description: 'Diario de trading con mentoría',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <ClerkProvider
          localization={esES}
          appearance={{
            variables: {
              colorPrimary: '#9184d9',
              colorBackground: '#232532',
              colorForeground: '#e9e9ed',
              colorInput: '#161826',
              colorInputForeground: '#e9e9ed',
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
