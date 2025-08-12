'use client'

import { useState, useEffect } from 'react'
import { apiClient, UserProfile, UpdateUserProfileRequest, NotificationPreferences } from '@/lib/api'

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
  onProfileUpdated?: () => void
  isInitialSetup?: boolean
}

import { DUPR_LEVELS, formatDUPRLevel, type DUPRLevel } from '@/lib/dupr'

const DUPR_OPTIONS = DUPR_LEVELS.map(level => ({
  value: level,
  label: formatDUPRLevel(level)
}))

export function UserProfileModal({ 
  isOpen, 
  onClose, 
  onProfileUpdated, 
  isInitialSetup = false 
}: UserProfileModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    dupr: '' as UpdateUserProfileRequest['dupr'] | '',
    notificationPreferences: {
      emailEnabled: true,
      gameReminders: true,
      gameCancellations: true,
      preferredMethod: 'email' as 'email' | 'in-app'
    }
  })

  useEffect(() => {
    if (isOpen && !isInitialSetup) {
      loadCurrentProfile()
    }
  }, [isOpen, isInitialSetup])

  const formatPhoneForDisplay = (e164Phone?: string) => {
    if (!e164Phone) return ''
    // Convert +1XXXXXXXXXX to (XXX) XXX-XXXX
    const phoneDigits = e164Phone.replace(/\D/g, '')
    if (phoneDigits.startsWith('1') && phoneDigits.length === 11) {
      const tenDigits = phoneDigits.slice(1)
      return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`
    }
    return e164Phone // Return as-is if not a standard US number
  }

  const loadCurrentProfile = async () => {
    try {
      setIsLoading(true)
      const profile = await apiClient.getCurrentUserProfile()
      setCurrentProfile(profile)
      setFormData({
        name: profile.name || '',
        phone: formatPhoneForDisplay(profile.phone),
        dupr: profile.dupr || '',
        notificationPreferences: profile.notificationPreferences || {
          emailEnabled: true,
          gameReminders: true,
          gameCancellations: true,
          preferredMethod: 'email'
        }
      })
    } catch (error) {
      console.error('Error loading profile:', error)
      // If profile doesn't exist, start with empty values
      setFormData({
        name: '',
        phone: '',
        dupr: '',
        notificationPreferences: {
          emailEnabled: true,
          gameReminders: true,
          gameCancellations: true,
          preferredMethod: 'email'
        }
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsLoading(true)
      
      const updateData: UpdateUserProfileRequest = {}
      if (formData.name.trim()) updateData.name = formData.name.trim()
      if (formData.phone.trim()) {
        // Convert formatted phone to E.164 format (+1XXXXXXXXXX)
        const phoneDigits = formData.phone.replace(/\D/g, '')
        if (phoneDigits.length === 10) {
          updateData.phone = `+1${phoneDigits}`
        } else {
          updateData.phone = formData.phone.trim() // Keep as is if not 10 digits
        }
      }
      if (formData.dupr) updateData.dupr = formData.dupr
      
      // Always update notification preferences if phone number is provided
      if (formData.phone.trim()) {
        updateData.notificationPreferences = formData.notificationPreferences
      }

      await apiClient.updateUserProfile(updateData)
      
      onProfileUpdated?.()
      onClose()
      
      if (isInitialSetup) {
        alert('Profile setup complete! Welcome to Pickle Play Dates!')
      } else {
        alert('Profile updated successfully!')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      alert('Failed to update profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatPhoneNumber = (value: string) => {
    // Remove all non-numeric characters
    const phoneNumber = value.replace(/\D/g, '')
    
    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length >= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`
    } else if (phoneNumber.length >= 3) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`
    } else {
      return phoneNumber
    }
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value)
    if (formatted.replace(/\D/g, '').length <= 10) {
      setFormData({ ...formData, phone: formatted })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {isInitialSetup ? 'Complete Your Profile' : 'Edit Profile'}
            </h2>
            {!isInitialSetup && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {isInitialSetup && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                          <p className="text-sm text-blue-800">
              Welcome! Please complete your profile to help other players know more about you. 
              Make sure to update your display name and DUPR rating.
            </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter your display name"
                required
              />
            </div>

            <div>
              <label htmlFor="dupr" className="block text-sm font-medium text-gray-700 mb-1">
                DUPR Rating <span className="text-red-500">*</span>
              </label>
              <select
                id="dupr"
                value={formData.dupr}
                onChange={(e) => setFormData({ ...formData, dupr: e.target.value as UpdateUserProfileRequest['dupr'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              >
                <option value="">Select your DUPR rating</option>
                {DUPR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Don't know your DUPR? Choose the range that best represents your skill level.
              </p>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="(555) 123-4567"
              />
              <p className="mt-1 text-xs text-gray-500">
                Phone number is optional and may be used for court contact purposes.
              </p>
            </div>

            <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900">Notification Settings</h3>
              <p className="text-xs text-gray-600">
                You can receive email notifications for game updates. You can change these preferences anytime.
              </p>
                
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="emailEnabled"
                      checked={formData.notificationPreferences.emailEnabled}
                      onChange={(e) => setFormData({
                        ...formData,
                        notificationPreferences: {
                          ...formData.notificationPreferences,
                          emailEnabled: e.target.checked
                        }
                      })}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="emailEnabled" className="ml-2 text-sm text-gray-700">
                      Enable email notifications
                    </label>
                  </div>

                  {formData.notificationPreferences.emailEnabled && (
                    <>
                      <div className="flex items-center ml-6">
                        <input
                          type="checkbox"
                          id="gameReminders"
                          checked={formData.notificationPreferences.gameReminders}
                          onChange={(e) => setFormData({
                            ...formData,
                            notificationPreferences: {
                              ...formData.notificationPreferences,
                              gameReminders: e.target.checked
                            }
                          })}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <label htmlFor="gameReminders" className="ml-2 text-sm text-gray-600">
                          Game reminders (24 hours and 1 hour before)
                        </label>
                      </div>
                      
                      <div className="flex items-center ml-6">
                        <input
                          type="checkbox"
                          id="gameCancellations"
                          checked={formData.notificationPreferences.gameCancellations}
                          onChange={(e) => setFormData({
                            ...formData,
                            notificationPreferences: {
                              ...formData.notificationPreferences,
                              gameCancellations: e.target.checked
                            }
                          })}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <label htmlFor="gameCancellations" className="ml-2 text-sm text-gray-600">
                          Game cancellation alerts
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </div>

            <div className="flex space-x-3 pt-4">
              {!isInitialSetup && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className={`${isInitialSetup ? 'w-full' : 'flex-1'} btn btn-primary`}
              >
                {isLoading ? 'Saving...' : isInitialSetup ? 'Complete Setup' : 'Update Profile'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}