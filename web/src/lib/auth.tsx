'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { Amplify } from 'aws-amplify'
import { getCurrentUser, signIn, signOut, signInWithRedirect, AuthUser } from 'aws-amplify/auth'
import { apiClient } from './api'

// Configure Amplify
const userPoolId = process.env.NEXT_PUBLIC_USER_POOL_ID
const userPoolClientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID
const userPoolDomain = process.env.NEXT_PUBLIC_USER_POOL_DOMAIN
const enableGoogleSignIn = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN === 'true'

if (!userPoolId || !userPoolClientId) {
  console.error('Missing required Cognito configuration')
}

const amplifyConfig: any = {
  Auth: {
    Cognito: {
      userPoolId: userPoolId || 'us-west-2_nxJAslgC2',
      userPoolClientId: userPoolClientId || '6lt836eebjv7di96jsnspl2p5g',
    }
  }
}

// Only add OAuth configuration if Google Sign-In is enabled and domain is configured
if (enableGoogleSignIn && userPoolDomain) {
  amplifyConfig.Auth.Cognito.loginWith = {
    oauth: {
      domain: userPoolDomain,
      scopes: ['email', 'openid', 'profile'],
      redirectSignIn: [
        typeof window !== 'undefined' ? window.location.origin : 'https://dodcyw1qbl5cy.cloudfront.net'
      ],
      redirectSignOut: [
        typeof window !== 'undefined' ? window.location.origin : 'https://dodcyw1qbl5cy.cloudfront.net'
      ],
      responseType: 'code'
    }
  }
}

Amplify.configure(amplifyConfig)

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  needsProfileCompletion: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  checkAuthState: () => Promise<void>
  setNeedsProfileCompletion: (needs: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false)

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
        console.log('✅ Profile initialized successfully')
        
        // Check if profile needs completion
        try {
          const profile = await apiClient.getCurrentUserProfile()
          // Profile needs completion if DUPR is missing or name is still default
          const needsCompletion = !profile.dupr || 
                                 profile.name === 'Pickle Player' || 
                                 profile.name === 'New Player'
          setNeedsProfileCompletion(needsCompletion)
        } catch (error) {
          console.log('⚠️ Could not check profile completion status:', error)
          setNeedsProfileCompletion(true) // Assume needs completion if we can't check
        }
      } catch (error) {
        // Ignore errors - profile might already exist or API might not be ready
        console.log('⚠️ Profile initialization skipped:', error)
      }
    } catch (error) {
      console.log('No authenticated user')
      setUser(null)
      setNeedsProfileCompletion(false)
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
    needsProfileCompletion,
    signInWithGoogle,
    signOut: handleSignOut,
    checkAuthState,
    setNeedsProfileCompletion
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