import React, { useState } from 'react'
import { apiClient } from '@/lib/api'
import { CreateCourtRequest } from '@/lib/api'

interface CreateCourtModalProps {
  isOpen: boolean
  onClose: () => void
  onCourtCreated?: () => void
}

interface FormData {
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  courtType: 'indoor' | 'outdoor' | 'both'
  numberOfCourts: string
  reservationStatus: 'requires_reservation' | 'reservations_available' | 'no_reservations' | ''
  hoursOfOperation: string
  fees: string
  website: string
  phone: string
  description: string
  amenities: string[]
}

const amenityOptions = [
  'restrooms',
  'water',
  'lighting',
  'must_bring_net'
]

const getAmenityLabel = (amenity: string): string => {
  const labels: Record<string, string> = {
    'restrooms': 'Restrooms',
    'water': 'Water Fountain',
    'lighting': 'Lighting',
    'must_bring_net': 'Must Bring Net'
  }
  return labels[amenity] || amenity
}

export default function CreateCourtModal({ isOpen, onClose, onCourtCreated }: CreateCourtModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    courtType: 'outdoor',
    numberOfCourts: '1',
    reservationStatus: '',
    hoursOfOperation: '',
    fees: '',
    website: '',
    phone: '',
    description: '',
    amenities: []
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullAddress, setFullAddress] = useState('')
  const [parseSuccess, setParseSuccess] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleAmenityChange = (amenity: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      amenities: checked 
        ? [...prev.amenities, amenity]
        : prev.amenities.filter(a => a !== amenity)
    }))
  }

  const parseAddress = (address: string) => {
    // Remove extra whitespace and normalize
    const cleanAddress = address.trim().replace(/\s+/g, ' ')
    
    // Common patterns for US addresses from Google Maps:
    // "1405 Warren Ave N, Seattle, WA 98109"
    // "123 Main St, City Name, State 12345"
    // "456 Oak Avenue, Some City, ST 12345-1234"
    
    // Split by commas first
    const parts = cleanAddress.split(',').map(part => part.trim())
    
    if (parts.length >= 3) {
      const streetAddress = parts[0]
      const city = parts[1]
      const stateZipPart = parts[2]
      
      // Parse state and zip from the last part
      // Patterns: "WA 98109", "State 12345", "ST 12345-1234"
      const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/) ||
                           stateZipPart.match(/^([A-Za-z\s]+)\s+(\d{5}(?:-\d{4})?)$/)
      
      if (stateZipMatch) {
        const state = stateZipMatch[1].trim()
        const zipCode = stateZipMatch[2]
        
        return {
          address: streetAddress,
          city: city,
          state: state,
          zipCode: zipCode
        }
      }
    }
    
    // If parsing fails, return null
    return null
  }

  const handleFullAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setFullAddress(value)
    setParseSuccess(false) // Reset success state when user types
    
    // Try to parse the address as user types
    if (value.includes(',')) {
      const parsed = parseAddress(value)
      if (parsed) {
        setFormData(prev => ({
          ...prev,
          address: parsed.address,
          city: parsed.city,
          state: parsed.state,
          zipCode: parsed.zipCode
        }))
        setParseSuccess(true)
        setError(null)
      }
    }
  }

  const handleParseAddress = () => {
    if (!fullAddress.trim()) return
    
    const parsed = parseAddress(fullAddress)
    if (parsed) {
      setFormData(prev => ({
        ...prev,
        address: parsed.address,
        city: parsed.city,
        state: parsed.state,
        zipCode: parsed.zipCode
      }))
      setParseSuccess(true)
      setError(null)
    } else {
      setParseSuccess(false)
      setError('Could not parse address. Please ensure it follows the format: "Street Address, City, State ZIP"')
    }
  }



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const courtRequest: CreateCourtRequest = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        zipCode: formData.zipCode.trim(),
        country: 'USA',
        courtType: formData.courtType,
        numberOfCourts: parseInt(formData.numberOfCourts),
        isReservable: formData.reservationStatus === 'reservations_available' || formData.reservationStatus === 'requires_reservation',
        ...(formData.hoursOfOperation.trim() && { hoursOfOperation: formData.hoursOfOperation.trim() }),
        ...(formData.fees.trim() && { fees: formData.fees.trim() }),
        ...(formData.website.trim() && { website: formData.website.trim() }),
        ...(formData.phone.trim() && { phone: formData.phone.trim() }),
        ...(formData.description.trim() && { description: formData.description.trim() }),
        amenities: formData.amenities
      }

      await apiClient.createCourt(courtRequest)
      
      // Reset form
      setFormData({
        name: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
        courtType: 'outdoor',
        numberOfCourts: '1',
        reservationStatus: '',
        hoursOfOperation: '',
        fees: '',
        website: '',
        phone: '',
        description: '',
        amenities: []
      })
      setFullAddress('')
      setParseSuccess(false)

      onCourtCreated?.()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to submit court. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Submit New Court</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Court Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Central Park Pickleball Courts"
              />
            </div>

            {/* Address Entry */}
            <div>
              <label htmlFor="fullAddress" className="block text-sm font-medium text-gray-700 mb-1">
                Address *
              </label>
              <input
                type="text"
                id="fullAddress"
                value={fullAddress}
                onChange={handleFullAddressChange}
                placeholder="1405 Warren Ave N, Seattle, WA 98109"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>



            {/* Court Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="courtType" className="block text-sm font-medium text-gray-700 mb-1">
                  Court Type *
                </label>
                <select
                  id="courtType"
                  name="courtType"
                  value={formData.courtType}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="both">Both Indoor & Outdoor</option>
                </select>
              </div>

              <div>
                <label htmlFor="numberOfCourts" className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Courts *
                </label>
                <input
                  type="number"
                  id="numberOfCourts"
                  name="numberOfCourts"
                  value={formData.numberOfCourts}
                  onChange={handleInputChange}
                  required
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Reservation Status */}
            <div>
              <label htmlFor="reservationStatus" className="block text-sm font-medium text-gray-700 mb-1">
                Court Requires Reservations? *
              </label>
              <select
                id="reservationStatus"
                name="reservationStatus"
                value={formData.reservationStatus}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Please select...</option>
                <option value="requires_reservation">Requires Reservation</option>
                <option value="reservations_available">Reservations Available</option>
                <option value="no_reservations">No Reservations</option>
              </select>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="hoursOfOperation" className="block text-sm font-medium text-gray-700 mb-1">
                  Hours of Operation
                </label>
                <textarea
                  id="hoursOfOperation"
                  name="hoursOfOperation"
                  value={formData.hoursOfOperation}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Daily 6 AM - 10 PM"
                />
              </div>

              <div>
                <label htmlFor="fees" className="block text-sm font-medium text-gray-700 mb-1">
                  Fees & Pricing
                </label>
                <textarea
                  id="fees"
                  name="fees"
                  value={formData.fees}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Free, $5/hour, Daily pass $20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  id="website"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            {/* Amenities */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amenities
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {amenityOptions.map(amenity => (
                  <label key={amenity} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.amenities.includes(amenity)}
                      onChange={(e) => handleAmenityChange(amenity, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-900">
                      {getAmenityLabel(amenity)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Additional Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional information about the courts..."
              />
            </div>

            {/* Submission Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    Your court submission will be reviewed by administrators before appearing in the public court list.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Court'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}