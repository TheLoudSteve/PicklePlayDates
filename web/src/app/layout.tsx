import './globals.css'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/lib/auth'
import ErrorBoundary from '@/components/ErrorBoundary'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Pickle Play Dates',
  description: 'Schedule and manage pickleball games with friends',
  manifest: '/manifest.json',
}

export function generateViewport() {
  return {
    themeColor: '#22c55e',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
} 