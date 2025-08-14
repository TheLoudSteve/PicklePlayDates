# Calendar Integration

## Overview
The calendar integration feature allows web users to add pickleball games to their personal calendars through multiple providers and formats.

## Features
- **Google Calendar**: Direct web integration with URL generation
- **Outlook Calendar**: Microsoft 365 and Outlook.com support  
- **ICS File Download**: Universal calendar file for any calendar application
- **Smart Provider Detection**: Automatic detection of user's preferred calendar based on device

## Components

### Core Utilities (`src/lib/calendar.ts`)
- `gameToCalendarEvent()`: Converts Game objects to CalendarEvent format
- `generateICSFile()`: Creates RFC 5545 compliant ICS files
- `generateGoogleCalendarUrl()`: Builds Google Calendar web URLs
- `generateOutlookCalendarUrl()`: Builds Outlook Calendar web URLs
- `downloadICSFile()`: Handles browser file downloads

### UI Components
- `AddToCalendarButton`: Flexible button component with 3 variants (button, dropdown, inline)
- `CalendarModal`: Rich modal interface with game preview and provider selection
- `useCalendar`: Custom React hook for calendar state management

### Integration Points
- **Game Details Modal**: Dropdown calendar options after game information
- **Dashboard**: Calendar buttons on game cards in "My Games" section

## Usage

```typescript
import { useCalendar } from '@/hooks/useCalendar'
import { AddToCalendarButton } from '@/components/AddToCalendarButton'

// In your component
const { addGameToGoogleCalendar, isLoading, error } = useCalendar()

// Add to calendar
await addGameToGoogleCalendar(game, court)
```

## Testing
- **10 comprehensive tests** covering all functionality
- **ICS file generation and validation**
- **URL generation for all providers**
- **Edge cases and error handling**

All tests passing ✅

## Browser Compatibility
- **Chrome/Edge**: Full support for all features
- **Firefox**: Full support for all features  
- **Safari**: Full support for all features
- **Mobile browsers**: ICS download and calendar URL support

## Future Enhancements
- Mobile app calendar integration (native iOS/Android APIs)
- Additional calendar providers (Yahoo, AOL, etc.)
- Recurring event support
- Calendar event updates/cancellations

---
*Calendar integration implemented and deployed as of August 2024*