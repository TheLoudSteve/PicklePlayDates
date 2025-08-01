'use client'

import { useState } from 'react'
import { apiClient, CreateGameRequest } from '@/lib/api'

interface CreateGameModalProps {
  isOpen: boolean
  onClose: () => void
  onGameCreated: () => void
}

export function CreateGameModal({ isOpen, onClose, onGameCreated }: CreateGameModalProps) {
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    locationId: '',
    minPlayers: 4,
    maxPlayers: 6
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      // Combine date and time into ISO string
      const datetimeUTC = new Date(`${formData.date}T${formData.time}`).toISOString()

      const gameRequest: CreateGameRequest = {
        datetimeUTC,
        locationId: formData.locationId,
        minPlayers: formData.minPlayers,
        maxPlayers: formData.maxPlayers
      }

      await apiClient.createGame(gameRequest)
      
      // Reset form
      setFormData({
        date: '',
        time: '',
        locationId: '',
        minPlayers: 4,
        maxPlayers: 6
      })
      
      onGameCreated()
      onClose()
    } catch (err: any) {
      // If profile not found error, try to initialize profile and retry
      if (err.message?.includes('User profile not found') || err.message?.includes('404')) {
        try {
          await apiClient.initializeUserProfile()
          
          // Recreate game request for retry
          const datetimeUTC = new Date(`${formData.date}T${formData.time}`).toISOString()
          const retryGameRequest: CreateGameRequest = {
            datetimeUTC,
            locationId: formData.locationId,
            minPlayers: formData.minPlayers,
            maxPlayers: formData.maxPlayers
          }
          
          // Retry game creation
          await apiClient.createGame(retryGameRequest)
          
          // Reset form
          setFormData({
            date: '',
            time: '',
            locationId: '',
            minPlayers: 4,
            maxPlayers: 6
          })
          
          onGameCreated()
          onClose()
          return
        } catch (retryErr: any) {
          setError(`Profile setup failed: ${retryErr.message || 'Please try again'}`)
          return
        }
      }
      
      // Show more detailed error information for debugging
      console.error('Create game error:', err)
      setError(`Error: ${err.message || 'Failed to create game'} (Status: ${err.status || 'Unknown'})`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Get today's date for min date validation
  const today = new Date().toISOString().split('T')[0]
  
  // Get current time for min time validation (if today is selected)
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  const isToday = formData.date === today

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Create New Game</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Date */}
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                id="date"
                required
                min={today}
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                className="input w-full"
              />
            </div>

            {/* Time */}
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-gray-700 mb-1">
                Time *
              </label>
              <input
                type="time"
                id="time"
                required
                min={isToday ? currentTime : undefined}
                value={formData.time}
                onChange={(e) => handleChange('time', e.target.value)}
                className="input w-full"
              />
              {isToday && (
                <p className="text-xs text-gray-500 mt-1">
                  Time must be in the future
                </p>
              )}
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location/Court *
              </label>
              <select
                id="location"
                required
                value={formData.locationId}
                onChange={(e) => handleChange('locationId', e.target.value)}
                className="input w-full"
              >
                <option value="">Select a location...</option>
                <option value="central-park-courts">Central Park Courts</option>
                <option value="riverside-rec-center">Riverside Recreation Center</option>
                <option value="community-sports-complex">Community Sports Complex</option>
                <option value="westside-tennis-club">Westside Tennis Club</option>
                <option value="downtown-athletic-club">Downtown Athletic Club</option>
                <option value="lakefront-courts">Lakefront Courts</option>
                <option value="other">Other (specify in game details)</option>
              </select>
            </div>

            {/* Player Count */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="minPlayers" className="block text-sm font-medium text-gray-700 mb-1">
                  Min Players
                </label>
                <select
                  id="minPlayers"
                  value={formData.minPlayers}
                  onChange={(e) => handleChange('minPlayers', parseInt(e.target.value))}
                  className="input w-full"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-700 mb-1">
                  Max Players
                </label>
                <select
                  id="maxPlayers"
                  value={formData.maxPlayers}
                  onChange={(e) => handleChange('maxPlayers', parseInt(e.target.value))}
                  className="input w-full"
                >
                  {[2, 3, 4, 5, 6, 7, 8].filter(num => num >= formData.minPlayers).map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Info Note */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                💡 You'll automatically be added as the first player when you create the game.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn btn-primary"
                disabled={isSubmitting || !formData.date || !formData.time || !formData.locationId}
              >
                {isSubmitting ? 'Creating...' : 'Create Game'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}