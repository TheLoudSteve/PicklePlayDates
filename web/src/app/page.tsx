'use client'

import { useAuth } from '@/lib/auth'
import { LoginPage } from '@/components/LoginPage'
import { Dashboard } from '@/components/Dashboard'
import { LoadingSpinner } from '@/components/LoadingSpinner'

export default function HomePage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <Dashboard />
} 