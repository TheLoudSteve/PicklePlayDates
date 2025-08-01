'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { getCurrentUser, signIn, signOut, signInWithRedirect, AuthUser } from 'aws-amplify/auth'
import { apiClient } from './api'

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_USER_POOL_DOMAIN!,
          scopes: ['email', 'openid', 'profile'],
          redirectSignIn: [
            typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
          ],
          redirectSignOut: [
            typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
          ],
          responseType: 'code'
        }
      }
    }
  }
})

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    checkAuthState()
  }, [])

  const checkAuthState = async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      
      // Try to initialize user profile if it doesn't exist
      try {
        await apiClient.initializeUserProfile()
      } catch (error) {
        // Ignore errors - profile might already exist or API might not be ready
        console.log('Profile initialization skipped:', error)
      }
    } catch (error) {
      console.log('No authenticated user')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    try {
      await signInWithRedirect({
        provider: 'Google'
      })
    } catch (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setUser(null)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  const value = {
    user,
    isLoading,
    signInWithGoogle,
    signOut: handleSignOut
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 