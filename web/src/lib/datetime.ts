/**
 * Standardized datetime utilities for consistent timezone handling
 * 
 * Rules:
 * 1. Always store times in UTC on the backend
 * 2. Always display times in local timezone on the frontend
 * 3. Always convert properly between UTC and local time
 */

/**
 * Format a UTC datetime string for display in local timezone
 */
export function formatDateTime(dateTimeUTC: string) {
  const date = new Date(dateTimeUTC);
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    full: date.toLocaleString()
  };
}

/**
 * Format a UTC datetime string for detailed display in local timezone
 */
export function formatDateTimeDetailed(dateTimeUTC: string) {
  const date = new Date(dateTimeUTC);
  return {
    date: date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    })
  };
}

/**
 * Convert a UTC datetime string to local datetime-local input format
 * Used for populating datetime-local input fields
 */
export function utcToLocalDateTimeInput(dateTimeUTC: string): string {
  const localDate = new Date(dateTimeUTC);
  // Adjust for timezone offset to get local time
  const localDateTimeString = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return localDateTimeString;
}

/**
 * Convert a datetime-local input value to UTC
 * Used when submitting forms with datetime-local inputs
 * Note: datetime-local inputs are already treated as local time by the browser
 */
export function localDateTimeInputToUTC(localDateTimeInput: string): string {
  const localDate = new Date(localDateTimeInput);
  // The browser already treats datetime-local as local time, so just convert to ISO
  return localDate.toISOString();
}

/**
 * Convert local date and time inputs to UTC
 * Used for separate date and time inputs (like in CreateGameModal)
 */
export function localDateTimeToUTC(date: string, time: string): string {
  const localDateTime = new Date(`${date}T${time}`);
  return localDateTime.toISOString();
}

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 * Used for min date validation in date inputs
 */
export function getTodayLocalDate(): string {
  return new Date().toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
}

/**
 * Get current time in HH:MM format (local timezone)
 * Used for min time validation in time inputs
 */
export function getCurrentLocalTime(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}
