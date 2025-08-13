import { 
  gameToCalendarEvent, 
  generateICSFile, 
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  getPreferredCalendarProvider
} from '../calendar'
import { Game, Court } from '../api'

describe('Calendar Integration', () => {
  const mockGame: Game = {
    gameId: 'test-game-123',
    datetimeUTC: '2024-01-20T15:00:00.000Z',
    players: [
      { userId: '1', userName: 'Alice Johnson', joinedAt: '2024-01-19T10:00:00.000Z' },
      { userId: '2', userName: 'Bob Smith', joinedAt: '2024-01-19T11:00:00.000Z' }
    ],
    maxPlayers: 4,
    minDUPR: '3.0',
    maxDUPR: '4.0'
  } as Game

  const mockCourt: Partial<Court> = {
    courtId: 'court-123',
    name: 'Central Park Courts',
    address: '123 Park Ave, New York, NY 10001'
  }

  describe('gameToCalendarEvent', () => {
    it('should convert game to calendar event correctly', () => {
      const event = gameToCalendarEvent(mockGame, mockCourt)

      expect(event.title).toBe('Pickleball Game (2/4 players)')
      expect(event.start).toEqual(new Date('2024-01-20T15:00:00.000Z'))
      expect(event.end).toEqual(new Date('2024-01-20T16:30:00.000Z')) // 90 minutes later
      expect(event.location).toBe('Central Park Courts, 123 Park Ave, New York, NY 10001')
      expect(event.description).toContain('Players: 2/4')
      expect(event.description).toContain('Skill Level: 3.0 - 4.0')
      expect(event.description).toContain('• Alice Johnson')
      expect(event.description).toContain('• Bob Smith')
      expect(event.url).toBe('https://test.pickleplaydates.com/games/test-game-123')
    })

    it('should handle game without court', () => {
      const event = gameToCalendarEvent(mockGame)

      expect(event.location).toBe('TBD')
    })

    it('should handle game without players', () => {
      const gameWithoutPlayers = { ...mockGame, players: [] }
      const event = gameToCalendarEvent(gameWithoutPlayers, mockCourt)

      expect(event.title).toBe('Pickleball Game (0/4 players)')
      expect(event.description).toContain('Players: 0/4')
      expect(event.description).not.toContain('Players:\n•')
    })
  })

  describe('generateICSFile', () => {
    it('should generate valid ICS content', () => {
      const event = gameToCalendarEvent(mockGame, mockCourt)
      const icsContent = generateICSFile(event)

      expect(icsContent).toContain('BEGIN:VCALENDAR')
      expect(icsContent).toContain('END:VCALENDAR')
      expect(icsContent).toContain('BEGIN:VEVENT')
      expect(icsContent).toContain('END:VEVENT')
      expect(icsContent).toContain('SUMMARY:Pickleball Game (2/4 players)')
      expect(icsContent).toContain('DTSTART:20240120T150000Z')
      expect(icsContent).toContain('DTEND:20240120T163000Z')
      expect(icsContent).toContain('LOCATION:Central Park Courts\\, 123 Park Ave\\, New York\\, NY 10001')
      expect(icsContent).toContain('URL:https://test.pickleplaydates.com/games/test-game-123')
    })

    it('should escape special characters in ICS', () => {
      const eventWithSpecialChars = {
        ...gameToCalendarEvent(mockGame, mockCourt),
        title: 'Game; with, special\ncharacters\\test',
        description: 'Description with\nnewlines and; semicolons, commas'
      }
      
      const icsContent = generateICSFile(eventWithSpecialChars)

      expect(icsContent).toContain('SUMMARY:Game\\; with\\, special\\ncharacters\\\\test')
      expect(icsContent).toContain('DESCRIPTION:Description with\\nnewlines and\\; semicolons\\, commas')
    })
  })

  describe('generateGoogleCalendarUrl', () => {
    it('should generate valid Google Calendar URL', () => {
      const event = gameToCalendarEvent(mockGame, mockCourt)
      const url = generateGoogleCalendarUrl(event)

      expect(url).toContain('https://calendar.google.com/calendar/render')
      expect(url).toContain('action=TEMPLATE')
      expect(url).toContain('text=Pickleball+Game+%282%2F4+players%29')
      expect(url).toContain('dates=20240120T150000Z%2F20240120T163000Z')
      expect(url).toContain('location=Central+Park+Courts%2C+123+Park+Ave%2C+New+York%2C+NY+10001')
      expect(url).toContain('website=https%3A%2F%2Ftest.pickleplaydates.com%2Fgames%2Ftest-game-123')
    })
  })

  describe('generateOutlookCalendarUrl', () => {
    it('should generate valid Outlook Calendar URL', () => {
      const event = gameToCalendarEvent(mockGame, mockCourt)
      const url = generateOutlookCalendarUrl(event)

      expect(url).toContain('https://outlook.live.com/calendar/0/deeplink/compose')
      expect(url).toContain('subject=Pickleball+Game+%282%2F4+players%29')
      expect(url).toContain('startdt=2024-01-20T15%3A00%3A00.000Z')
      expect(url).toContain('enddt=2024-01-20T16%3A30%3A00.000Z')
      expect(url).toContain('location=Central+Park+Courts%2C+123+Park+Ave%2C+New+York%2C+NY+10001')
    })
  })

  describe('getPreferredCalendarProvider', () => {
    it('should detect Apple devices', () => {
      // Mock user agent for iPhone
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true,
      })

      expect(getPreferredCalendarProvider()).toBe('apple')
    })

    it('should detect Mac devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        configurable: true,
      })

      expect(getPreferredCalendarProvider()).toBe('apple')
    })

    it('should default to Google for other devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        configurable: true,
      })

      expect(getPreferredCalendarProvider()).toBe('google')
    })
  })
})