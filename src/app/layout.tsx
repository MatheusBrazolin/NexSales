import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

/**
 * UI body font — variable weight, supports tnum/ss03 for tabular numbers
 * and a friendlier single-story "a". Covers Portuguese accents via latin-ext.
 */
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

/**
 * Monospace font for product codes, IDs and printed receipts.
 * Wider, more readable than the default monospace stack.
 */
const jetBrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: 'VendasApp — Gestão de Vendas',
  description: 'Sistema de gestão de vendas e estoque',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
