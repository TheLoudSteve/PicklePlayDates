'use client'

import { useState, useCallback } from 'react'
import { Game, Court } from '../lib/api'
import {
  gameToCalendarEvent,
  addToGoogleCalendar,
  addToOutlookCalendar,
  downloadICSFile,
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  generateICSFile
} from '../lib/calendar'

export interface UseCalendarOptions {
  onSuccess?: (provider: string) => void
  onError?: (error: Error, provider: string) => void
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCalendarAction = useCallback(async (
    action: () => void | Promise<void>,
    provider: string
  ) => {
    setIsLoading(provider)
    setError(null)

    try {
      await action()
      options.onSuccess?.(provider)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Calendar action failed'
      setError(errorMessage)
      options.onError?.(err instanceof Error ? err : new Error(errorMessage), provider)
    } finally {
      setIsLoading(null)
    }
  }, [options])

  const addGameToGoogleCalendar = useCallback((game: Game, court?: Partial<Court>) => {
    const event = gameToCalendarEvent(game, court)
    return handleCalendarAction(() => addToGoogleCalendar(event), 'google')
  }, [handleCalendarAction])

  const addGameToOutlookCalendar = useCallback((game: Game, court?: Partial<Court>) => {
    const event = gameToCalendarEvent(game, court)
    return handleCalendarAction(() => addToOutlookCalendar(event), 'outlook')
  }, [handleCalendarAction])

  const downloadGameCalendarFile = useCallback((game: Game, court?: Partial<Court>) => {
    const event = gameToCalendarEvent(game, court)
    return handleCalendarAction(() => downloadICSFile(event), 'download')
  }, [handleCalendarAction])

  const getGameCalendarUrls = useCallback((game: Game, court?: Partial<Court>) => {
    const event = gameToCalendarEvent(game, court)
    return {
      google: generateGoogleCalendarUrl(event),
      outlook: generateOutlookCalendarUrl(event),
      ics: generateICSFile(event)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isLoading,
    error,
    addGameToGoogleCalendar,
    addGameToOutlookCalendar, 
    downloadGameCalendarFile,
    getGameCalendarUrls,
    clearError
  }
}