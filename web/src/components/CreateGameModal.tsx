'use client'

import { useState, useEffect } from 'react'
import { apiClient, CreateGameRequest, Court } from '@/lib/api'

interface CreateGameModalProps {
  isOpen: boolean
  onClose: () => void
  onGameCreated: () => void
}

export function CreateGameModal({ isOpen, onClose, onGameCreated }: CreateGameModalProps) {
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    courtId: '',
    minPlayers: 4,
    maxPlayers: 6
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [courts, setCourts] = useState<Court[]>([])
  const [isLoadingCourts, setIsLoadingCourts] = useState(false)
  const [searchCity, setSearchCity] = useState('')
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)

  // Load courts when modal opens
  useEffect(() => {
    if (isOpen) {
      loadCourts()
    }
  }, [isOpen])

  const loadCourts = async (searchParams?: { city?: string, latitude?: number, longitude?: number, radius?: number }) => {
    setIsLoadingCourts(true)
    try {
      const response = await apiClient.searchCourts(searchParams)
      setCourts(response.courts)
    } catch (err) {
      console.error('Failed to load courts:', err)
      setError('Failed to load courts')
    } finally {
      setIsLoadingCourts(false)
    }
  }

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }
        setUserLocation(location)
        loadCourts({ latitude: location.latitude, longitude: location.longitude, radius: 50 }) // 50km radius
      },
      (error) => {
        setError('Unable to get your location: ' + error.message)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    )
  }

  const searchByCity = () => {
    if (searchCity.trim()) {
      loadCourts({ city: searchCity.trim() })
    } else {
      loadCourts()
    }
  }

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // Earth's radius in kilometers
    const dLat = toRadians(lat2 - lat1)
    const dLon = toRadians(lon2 - lon1)
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const toRadians = (degrees: number): number => {
    return degrees * (Math.PI / 180)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      // Combine date and time into ISO string
      const datetimeUTC = new Date(`${formData.date}T${formData.time}`).toISOString()

      const gameRequest: CreateGameRequest = {
        datetimeUTC,
        courtId: formData.courtId,
        minPlayers: formData.minPlayers,
        maxPlayers: formData.maxPlayers
      }

      await apiClient.createGame(gameRequest)
      
      // Reset form
      setFormData({
        date: '',
        time: '',
        courtId: '',
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
            courtId: formData.courtId,
            minPlayers: formData.minPlayers,
            maxPlayers: formData.maxPlayers
          }
          
          // Retry game creation
          await apiClient.createGame(retryGameRequest)
          
          // Reset form
          setFormData({
            date: '',
            time: '',
            courtId: '',
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

            {/* Court Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Court *
              </label>
              
              {/* Court Search */}
              <div className="mb-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by city..."
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={searchByCity}
                    disabled={isLoadingCourts}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Search
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isLoadingCourts}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    Near Me
                  </button>
                  <button
                    type="button"
                    onClick={() => loadCourts()}
                    disabled={isLoadingCourts}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                  >
                    All Courts
                  </button>
                </div>
              </div>

              {/* Court Selection */}
              <select
                required
                value={formData.courtId}
                onChange={(e) => handleChange('courtId', e.target.value)}
                className="input w-full"
                disabled={isLoadingCourts}
              >
                <option value="">
                  {isLoadingCourts ? 'Loading courts...' : 'Select a court...'}
                </option>
                {courts.map(court => (
                  <option key={court.courtId} value={court.courtId}>
                    {court.name} - {court.city}, {court.state}
                    {userLocation && court.latitude && court.longitude && (
                      ` (${calculateDistance(userLocation.latitude, userLocation.longitude, court.latitude, court.longitude).toFixed(1)} km away)`
                    )}
                  </option>
                ))}
              </select>
              
              {courts.length === 0 && !isLoadingCourts && (
                <p className="text-sm text-gray-500 mt-1">
                  No courts found. Try a different search or submit a new court.
                </p>
              )}
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
                disabled={isSubmitting || !formData.date || !formData.time || !formData.courtId}
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