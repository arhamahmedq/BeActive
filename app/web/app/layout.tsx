import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/providers/QueryProvider'

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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-app">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
