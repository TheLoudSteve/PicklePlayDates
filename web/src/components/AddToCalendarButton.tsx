'use client'

import React, { useState } from 'react'
import { Game, Court } from '@/lib/api'
import {
  gameToCalendarEvent,
  addToGoogleCalendar,
  addToOutlookCalendar,
  downloadICSFile,
  getPreferredCalendarProvider,
  getCalendarIcon,
  getCalendarName
} from '../lib/calendar'

interface AddToCalendarButtonProps {
  game: Game
  court?: Partial<Court>
  className?: string
  variant?: 'button' | 'dropdown' | 'inline'
  size?: 'sm' | 'md' | 'lg'
}

interface CalendarOption {
  provider: string
  name: string
  icon: string
  action: () => void
}

export default function AddToCalendarButton({
  game,
  court,
  className = '',
  variant = 'dropdown',
  size = 'md'
}: AddToCalendarButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState<string | null>(null)

  // Check if user is part of the game
  const isUserInGame = true // TODO: Replace with actual user check from auth context

  if (!isUserInGame) {
    return null // Don't show calendar options if user isn't in the game
  }

  const calendarEvent = gameToCalendarEvent(game, court)
  const preferredProvider = getPreferredCalendarProvider()

  const handleCalendarAction = async (provider: string, action: () => void) => {
    setIsLoading(provider)
    try {
      action()
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error('Calendar action failed:', error)
    } finally {
      setIsLoading(null)
      setIsOpen(false)
    }
  }

  const calendarOptions: CalendarOption[] = [
    {
      provider: 'google',
      name: 'Google Calendar',
      icon: '📅',
      action: () => addToGoogleCalendar(calendarEvent)
    },
    {
      provider: 'outlook',
      name: 'Outlook Calendar', 
      icon: '📆',
      action: () => addToOutlookCalendar(calendarEvent)
    },
    {
      provider: 'download',
      name: 'Download .ics file',
      icon: '💾',
      action: () => downloadICSFile(calendarEvent)
    }
  ]

  const buttonSizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  }

  // Single button variant - uses preferred provider
  if (variant === 'button') {
    const preferredOption = calendarOptions.find(opt => opt.provider === preferredProvider) || calendarOptions[0]
    
    return (
      <button
        onClick={() => handleCalendarAction(preferredOption.provider, preferredOption.action)}
        disabled={isLoading === preferredOption.provider}
        className={`
          inline-flex items-center gap-2 font-medium rounded-lg border border-gray-300 
          hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed transition-colors
          ${buttonSizeClasses[size]} ${className}
        `}
      >
        {isLoading === preferredOption.provider ? (
          <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${iconSizeClasses[size]}`} />
        ) : (
          <span className="text-lg">{preferredOption.icon}</span>
        )}
        Add to Calendar
      </button>
    )
  }

  // Inline variant - shows all options horizontally
  if (variant === 'inline') {
    return (
      <div className={`flex gap-2 ${className}`}>
        {calendarOptions.map((option) => (
          <button
            key={option.provider}
            onClick={() => handleCalendarAction(option.provider, option.action)}
            disabled={isLoading === option.provider}
            title={`Add to ${option.name}`}
            className={`
              inline-flex items-center gap-1 font-medium rounded-lg border border-gray-300
              hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors
              ${buttonSizeClasses[size]}
            `}
          >
            {isLoading === option.provider ? (
              <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${iconSizeClasses[size]}`} />
            ) : (
              <span className="text-lg">{option.icon}</span>
            )}
            <span className="sr-only">{option.name}</span>
          </button>
        ))}
      </div>
    )
  }

  // Dropdown variant (default)
  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          inline-flex items-center gap-2 font-medium rounded-lg border border-gray-300
          hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          transition-colors ${buttonSizeClasses[size]}
        `}
      >
        <span className="text-lg">📅</span>
        Add to Calendar
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown menu */}
          <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
            <div className="py-1">
              {calendarOptions.map((option) => (
                <button
                  key={option.provider}
                  onClick={() => handleCalendarAction(option.provider, option.action)}
                  disabled={isLoading === option.provider}
                  className="group flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading === option.provider ? (
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  ) : (
                    <span className="text-lg">{option.icon}</span>
                  )}
                  {option.name}
                </button>
              ))}
            </div>
            
            {/* Game preview */}
            <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
              <div className="font-medium text-gray-700">{calendarEvent.title}</div>
              <div className="mt-1">{calendarEvent.start.toLocaleDateString()} at {calendarEvent.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              {calendarEvent.location && (
                <div className="mt-1">{calendarEvent.location}</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}