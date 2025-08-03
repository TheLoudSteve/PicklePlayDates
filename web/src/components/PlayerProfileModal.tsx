'use client'

import { useState, useEffect } from 'react'
import { apiClient, UserProfile } from '@/lib/api'

interface PlayerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string | null
}

export function PlayerProfileModal({ isOpen, onClose, userId }: PlayerProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen && userId) {
      loadPlayerProfile()
    }
  }, [isOpen, userId])

  const loadPlayerProfile = async () => {
    if (!userId) return
    
    try {
      setIsLoading(true)
      // For now, we'll create a getUserProfile endpoint that takes a userId
      // Since we don't have this yet, we'll use placeholder data
      // In production, this would be: const profile = await apiClient.getUserProfile(userId)
      
      // Placeholder profile data
      setProfile({
        userId,
        email: 'player@example.com',
        name: 'Player Name',
        phone: '+15551234567',
        dupr: '3.5 to 4',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Error loading player profile:', error)
      alert('Failed to load player profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getDuprColor = (dupr?: string) => {
    if (!dupr) return 'text-gray-500'
    switch (dupr) {
      case 'Below 3': return 'text-blue-600'
      case '3 to 3.5': return 'text-green-600'
      case '3.5 to 4': return 'text-yellow-600'
      case '4 to 4.5': return 'text-orange-600'
      case 'Above 4.5': return 'text-red-600'
      default: return 'text-gray-500'
    }
  }

  const formatPhoneForDisplay = (e164Phone?: string) => {
    if (!e164Phone) return 'Not provided'
    // Convert +1XXXXXXXXXX to (XXX) XXX-XXXX
    const phoneDigits = e164Phone.replace(/\D/g, '')
    if (phoneDigits.startsWith('1') && phoneDigits.length === 11) {
      const tenDigits = phoneDigits.slice(1)
      return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`
    }
    return e164Phone // Return as-is if not a standard US number
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Player Profile
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : profile ? (
            <div className="space-y-6">
              {/* Player Info */}
              <div className="text-center">
                <div className="w-20 h-20 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{profile.name}</h3>
                <p className="text-gray-500">{profile.email}</p>
              </div>

              {/* DUPR Rating */}
              {profile.dupr && (
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-500 mb-1">DUPR Rating</div>
                  <div className={`text-lg font-semibold ${getDuprColor(profile.dupr)}`}>
                    {profile.dupr}
                  </div>
                </div>
              )}

              {/* Contact Information */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Contact Information</h4>
                
                <div className="flex items-center space-x-3 text-sm">
                  <span className="text-gray-500 min-w-[80px]">📧 Email:</span>
                  <span className="text-gray-900">{profile.email}</span>
                </div>
                
                <div className="flex items-center space-x-3 text-sm">
                  <span className="text-gray-500 min-w-[80px]">📱 Phone:</span>
                  <span className="text-gray-900">{formatPhoneForDisplay(profile.phone)}</span>
                </div>
              </div>

              {/* Player Stats */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">Player Stats</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Member Since:</span>
                    <div className="font-medium">{new Date(profile.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Last Updated:</span>
                    <div className="font-medium">{new Date(profile.updatedAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Failed to load player profile.
            </div>
          )}

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}