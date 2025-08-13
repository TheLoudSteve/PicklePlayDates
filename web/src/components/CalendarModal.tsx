'use client'

import React, { useState } from 'react'
import { Game, Court } from '@/lib/api'
import { useCalendar } from '../hooks/useCalendar'
import { gameToCalendarEvent } from '../lib/calendar'

interface CalendarModalProps {
  isOpen: boolean
  onClose: () => void
  game: Game
  court?: Partial<Court>
}

export default function CalendarModal({ isOpen, onClose, game, court }: CalendarModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const { 
    isLoading, 
    error, 
    addGameToGoogleCalendar, 
    addGameToOutlookCalendar, 
    downloadGameCalendarFile,
    clearError
  } = useCalendar({
    onSuccess: (provider) => {
      console.log(`Successfully added to ${provider} calendar`)
      // Auto-close modal after successful action
      setTimeout(() => onClose(), 1000)
    },
    onError: (error, provider) => {
      console.error(`Failed to add to ${provider} calendar:`, error)
    }
  })

  if (!isOpen) return null

  const calendarEvent = gameToCalendarEvent(game, court)

  const handleProviderSelect = async (provider: string) => {
    setSelectedProvider(provider)
    clearError()

    switch (provider) {
      case 'google':
        await addGameToGoogleCalendar(game, court)
        break
      case 'outlook':
        await addGameToOutlookCalendar(game, court)
        break
      case 'download':
        await downloadGameCalendarFile(game, court)
        break
    }
  }

  const providers = [
    {
      id: 'google',
      name: 'Google Calendar',
      icon: '📅',
      description: 'Add directly to your Google Calendar',
      popular: true
    },
    {
      id: 'outlook',
      name: 'Outlook Calendar',
      icon: '📆', 
      description: 'Add to Outlook.com or Microsoft 365'
    },
    {
      id: 'download',
      name: 'Download Calendar File',
      icon: '💾',
      description: 'Download .ics file for any calendar app'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Add to Calendar
            </h3>
            <button
              onClick={onClose}
              className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Game preview */}
          <div className="mb-6 rounded-lg border border-gray-200 p-4 bg-gray-50">
            <h4 className="font-medium text-gray-900">{calendarEvent.title}</h4>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25m-10.5 15.75h9a2.25 2.25 0 002.25-2.25V9.75a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 003 9.75v8.25A2.25 2.25 0 005.25 20.25z" />
                </svg>
                {calendarEvent.start.toLocaleDateString()} at {calendarEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {calendarEvent.location && (
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {calendarEvent.location}
                </div>
              )}
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                90 minutes
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Calendar Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Calendar providers */}
          <div className="space-y-3">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleProviderSelect(provider.id)}
                disabled={isLoading === provider.id}
                className={`
                  relative w-full flex items-center gap-4 p-4 border rounded-lg text-left
                  hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                  ${selectedProvider === provider.id && isLoading === provider.id ? 'ring-2 ring-blue-500' : 'border-gray-200'}
                `}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {isLoading === provider.id ? (
                    <div className="w-8 h-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  ) : (
                    <div className="w-8 h-8 flex items-center justify-center text-2xl">
                      {provider.icon}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{provider.name}</span>
                    {provider.popular && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{provider.description}</p>
                </div>

                {/* Loading/Success indicator */}
                {isLoading === provider.id && (
                  <div className="flex-shrink-0">
                    <div className="text-sm font-medium text-blue-600">
                      Adding...
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}