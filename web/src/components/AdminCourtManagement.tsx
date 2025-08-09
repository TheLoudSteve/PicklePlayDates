'use client'

import React, { useState, useEffect } from 'react'
import { apiClient, Court } from '@/lib/api'
import { LoadingSpinner } from './LoadingSpinner'

interface AdminCourtManagementProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminCourtManagement({ isOpen, onClose }: AdminCourtManagementProps) {
  const [courts, setCourts] = useState<Court[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'all'>('pending')

  useEffect(() => {
    if (isOpen) {
      loadCourts()
    }
  }, [isOpen, activeTab])

  const loadCourts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.getAdminCourts(true) // Include unapproved
      
      let filteredCourts = response.courts
      if (activeTab === 'pending') {
        filteredCourts = response.courts.filter(court => !court.isApproved)
      } else if (activeTab === 'approved') {
        filteredCourts = response.courts.filter(court => court.isApproved)
      }
      
      setCourts(filteredCourts)
    } catch (err: any) {
      setError(err.message || 'Failed to load courts')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveCourt = async (courtId: string) => {
    try {
      await apiClient.approveCourtAsAdmin(courtId, true)
      loadCourts() // Refresh the list
    } catch (err: any) {
      setError(err.message || 'Failed to approve court')
    }
  }

  const handleRejectCourt = async (courtId: string) => {
    try {
      await apiClient.approveCourtAsAdmin(courtId, false)
      loadCourts() // Refresh the list
    } catch (err: any) {
      setError(err.message || 'Failed to reject court')
    }
  }

  const handleDeleteCourt = async (courtId: string) => {
    if (window.confirm('Are you sure you want to delete this court? This action cannot be undone.')) {
      try {
        await apiClient.deleteCourtAsAdmin(courtId)
        loadCourts() // Refresh the list
      } catch (err: any) {
        setError(err.message || 'Failed to delete court')
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Admin: Court Management</h2>
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

          {/* Tab Navigation */}
          <div className="mb-6">
            <nav className="flex space-x-4">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'pending'
                    ? 'bg-orange-100 text-orange-700 border border-orange-300'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending Approval ({courts.filter(c => !c.isApproved).length})
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'approved'
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'all'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Courts
              </button>
            </nav>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : courts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No courts found for this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {courts.map((court) => (
                <div
                  key={court.courtId}
                  className={`border rounded-lg p-4 ${
                    court.isApproved ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{court.name}</h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          court.isApproved 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {court.isApproved ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                        <div>
                          <strong>Address:</strong><br />
                          {court.address}<br />
                          {court.city}, {court.state} {court.zipCode}
                        </div>
                        
                        <div>
                          <strong>Details:</strong><br />
                          {court.courtType} • {court.numberOfCourts} court{court.numberOfCourts !== 1 ? 's' : ''}<br />
                          {court.isReservable ? 'Reservations available' : 'No reservations'}
                        </div>
                        
                        <div>
                          <strong>Submitted by:</strong><br />
                          {court.submittedByName}<br />
                          <span className="text-xs text-gray-500">
                            {new Date(court.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {court.description && (
                        <div className="mt-3 text-sm text-gray-600">
                          <strong>Description:</strong> {court.description}
                        </div>
                      )}

                      {court.amenities && court.amenities.length > 0 && (
                        <div className="mt-2">
                          <span className="text-sm text-gray-600"><strong>Amenities:</strong> </span>
                          {court.amenities.map((amenity) => (
                            <span
                              key={amenity}
                              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 mr-1"
                            >
                              {amenity.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="ml-4 flex flex-col space-y-2">
                      {!court.isApproved && (
                        <>
                          <button
                            onClick={() => handleApproveCourt(court.courtId)}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectCourt(court.courtId)}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteCourt(court.courtId)}
                        className="px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
