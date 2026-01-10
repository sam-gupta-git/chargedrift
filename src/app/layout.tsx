import type { Metadata } from 'next'
import { Space_Mono, Outfit } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'ChargeDrift - Recurring Charge Drift Detector',
  description: 'Track which merchants are charging you more than they used to',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.variable} ${spaceMono.variable} font-sans antialiased min-h-screen`}>
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(251,191,36,0.08),rgba(0,0,0,0))]" />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
