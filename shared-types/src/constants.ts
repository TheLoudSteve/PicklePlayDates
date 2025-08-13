import { DUPRLevel, CourtType, GameStatus, UserRole } from './types/common';

/**
 * DUPR skill level constants
 */
export const DUPR_LEVELS: DUPRLevel[] = [
  'Below 3',
  '3 to 3.5',
  '3.5 to 4',
  '4 to 4.5',
  'Above 4.5',
];

/**
 * Court type constants
 */
export const COURT_TYPES: CourtType[] = [
  'indoor',
  'outdoor',
  'both',
];

/**
 * Game status constants
 */
export const GAME_STATUSES: GameStatus[] = [
  'scheduled',
  'closed',
  'cancelled',
  'past',
];

/**
 * User role constants
 */
export const USER_ROLES: UserRole[] = [
  'user',
  'admin',
];

/**
 * Game constraints
 */
export const GAME_CONSTRAINTS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  DEFAULT_MIN_PLAYERS: 4,
  DEFAULT_MAX_PLAYERS: 4,
  JOIN_CUTOFF_HOURS: 1, // Cannot join/leave within 1 hour of game start
} as const;

/**
 * Court constraints
 */
export const COURT_CONSTRAINTS = {
  MIN_NUMBER_OF_COURTS: 1,
  MAX_NUMBER_OF_COURTS: 20,
  MAX_NAME_LENGTH: 100,
  MAX_ADDRESS_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000,
} as const;

/**
 * User constraints
 */
export const USER_CONSTRAINTS = {
  MAX_NAME_LENGTH: 100,
  MIN_NAME_LENGTH: 1,
  PHONE_REGEX: /^\+[1-9]\d{1,14}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

/**
 * Common amenities for courts
 */
export const COMMON_AMENITIES = [
  'parking',
  'restrooms',
  'water_fountain',
  'lighting',
  'nets_provided',
  'equipment_rental',
  'pro_shop',
  'locker_rooms',
  'showers',
  'spectator_seating',
  'covered_courts',
  'air_conditioning',
  'food_service',
  'wheelchair_accessible',
] as const;

/**
 * API rate limiting constants
 */
export const RATE_LIMITS = {
  GAMES_PER_USER_PER_DAY: 10,
  COURTS_PER_USER_PER_DAY: 5,
  API_REQUESTS_PER_MINUTE: 100,
} as const;

/**
 * Notification timing constants (in hours)
 */
export const NOTIFICATION_TIMING = {
  GAME_REMINDER_24H: 24,
  GAME_REMINDER_1H: 1,
  REMINDER_BUFFER_MINUTES: 15, // Send reminders 15 minutes before exact time
} as const;

/**
 * Geographic constants
 */
export const GEOGRAPHIC_BOUNDS = {
  // US bounding box for initial validation
  US_BOUNDS: {
    MIN_LAT: 24.396308,
    MAX_LAT: 49.384358,
    MIN_LNG: -125.0,
    MAX_LNG: -66.93457,
  },
  // Default search radius in miles
  DEFAULT_SEARCH_RADIUS: 25,
  MAX_SEARCH_RADIUS: 100,
} as const;