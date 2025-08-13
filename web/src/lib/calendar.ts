import { Game, Court } from './api'

export interface CalendarEvent {
  title: string
  start: Date
  end: Date
  description: string
  location?: string
  url?: string
}

/**
 * Convert a game to a calendar event
 */
export function gameToCalendarEvent(game: Game, court?: Partial<Court>): CalendarEvent {
  const startDate = new Date(game.datetimeUTC)
  const endDate = new Date(startDate.getTime() + (90 * 60 * 1000)) // 90 minutes default
  
  const playerCount = game.players?.length || game.currentPlayers || 0
  const maxPlayers = game.maxPlayers || 4
  
  const title = `Pickleball Game (${playerCount}/${maxPlayers} players)`
  
  let description = `Pickleball game scheduled for ${startDate.toLocaleDateString()}.\n\n`
  description += `Players: ${playerCount}/${maxPlayers}\n`
  
  // Add skill level info if available
  if (game.minDUPR || game.maxDUPR) {
    const skillLevel = game.minDUPR && game.maxDUPR 
      ? `${game.minDUPR} - ${game.maxDUPR}`
      : game.minDUPR 
        ? `${game.minDUPR}+`
        : `Up to ${game.maxDUPR}`
    description += `Skill Level: ${skillLevel}\n`
  }
  
  if (game.players?.length) {
    description += `\nPlayers:\n${game.players.map(p => `• ${p.userName}`).join('\n')}`
  }
  
  // Add court info
  if (court || game.courtName) {
    description += `\nCourt: ${court?.name || game.courtName}`
    if (court?.address || game.courtAddress) {
      description += `\nAddress: ${court?.address || game.courtAddress}`
    }
  }
  
  description += `\n\nManage this game: ${typeof window !== 'undefined' ? window.location.origin : 'https://pickleplaydates.com'}`
  
  return {
    title,
    start: startDate,
    end: endDate,
    description,
    location: court ? `${court.name}, ${court.address}` : (game.courtName && game.courtAddress) ? `${game.courtName}, ${game.courtAddress}` : 'TBD',
    url: `${typeof window !== 'undefined' ? window.location.origin : 'https://pickleplaydates.com'}/games/${game.gameId}`
  }
}

/**
 * Generate ICS file content
 */
export function generateICSFile(event: CalendarEvent): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }
  
  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  }
  
  const now = new Date()
  const uid = `pickle-${Date.now()}@pickleplaydates.com`
  
  let ics = 'BEGIN:VCALENDAR\n'
  ics += 'VERSION:2.0\n'
  ics += 'PRODID:-//Pickle Play Dates//Calendar//EN\n'
  ics += 'CALSCALE:GREGORIAN\n'
  ics += 'METHOD:PUBLISH\n'
  ics += 'BEGIN:VEVENT\n'
  ics += `UID:${uid}\n`
  ics += `DTSTAMP:${formatDate(now)}\n`
  ics += `DTSTART:${formatDate(event.start)}\n`
  ics += `DTEND:${formatDate(event.end)}\n`
  ics += `SUMMARY:${escapeText(event.title)}\n`
  ics += `DESCRIPTION:${escapeText(event.description)}\n`
  
  if (event.location) {
    ics += `LOCATION:${escapeText(event.location)}\n`
  }
  
  if (event.url) {
    ics += `URL:${event.url}\n`
  }
  
  ics += 'STATUS:CONFIRMED\n'
  ics += 'TRANSP:OPAQUE\n'
  ics += 'END:VEVENT\n'
  ics += 'END:VCALENDAR'
  
  return ics
}

/**
 * Download ICS file
 */
export function downloadICSFile(event: CalendarEvent, filename?: string): void {
  const icsContent = generateICSFile(event)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `pickleball-game-${event.start.toISOString().split('T')[0]}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  window.URL.revokeObjectURL(url)
}

/**
 * Generate Google Calendar URL
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const formatGoogleDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(event.start)}/${formatGoogleDate(event.end)}`,
    details: event.description,
    ...(event.location && { location: event.location }),
    ...(event.url && { website: event.url })
  })
  
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Open Google Calendar in new tab
 */
export function addToGoogleCalendar(event: CalendarEvent): void {
  const url = generateGoogleCalendarUrl(event)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Generate Outlook Calendar URL
 */
export function generateOutlookCalendarUrl(event: CalendarEvent): string {
  const formatOutlookDate = (date: Date): string => {
    return date.toISOString()
  }
  
  const params = new URLSearchParams({
    subject: event.title,
    startdt: formatOutlookDate(event.start),
    enddt: formatOutlookDate(event.end),
    body: event.description,
    ...(event.location && { location: event.location })
  })
  
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

/**
 * Open Outlook Calendar in new tab
 */
export function addToOutlookCalendar(event: CalendarEvent): void {
  const url = generateOutlookCalendarUrl(event)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Detect user's calendar preference from user agent
 */
export function getPreferredCalendarProvider(): 'google' | 'outlook' | 'apple' | 'download' {
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
    return 'apple'
  }
  
  if (userAgent.includes('outlook') || userAgent.includes('microsoft')) {
    return 'outlook'
  }
  
  // Default to Google Calendar for web users
  return 'google'
}

/**
 * Get calendar provider icon
 */
export function getCalendarIcon(provider: string): string {
  switch (provider) {
    case 'google':
      return '📅'
    case 'outlook':
      return '📆'
    case 'apple':
      return '🍎'
    default:
      return '💾'
  }
}

/**
 * Get calendar provider name
 */
export function getCalendarName(provider: string): string {
  switch (provider) {
    case 'google':
      return 'Google Calendar'
    case 'outlook':
      return 'Outlook Calendar'
    case 'apple':
      return 'Apple Calendar'
    default:
      return 'Download Calendar File'
  }
}