import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/providers/QueryProvider'

// Self-hosted via next/font — zero Google DNS at runtime, preloaded, no flash
// Plus Jakarta Sans: humanist sans with rounded terminals that closely mirrors
// SF Pro's warmth. Ensures Android/Windows render the same premium feel as macOS.
const font = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  // Variable font — single file covers the full 300–800 weight range.
  // Smaller than loading 6 separate weight files.
  weight: ['300', '400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'BeActive',
  description: 'Daily workout proof. Social accountability. Streak-powered.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`h-full ${font.variable}`}>
      <body className="min-h-full bg-app font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
