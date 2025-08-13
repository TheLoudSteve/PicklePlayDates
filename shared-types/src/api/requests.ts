import { 
  UUID, 
  ISODateTime, 
  DUPRLevel, 
  CourtType, 
  PhoneNumber, 
  URL 
} from '../types/common';
import { NotificationPreferences } from '../types/notification';

/**
 * Request body for creating a new game
 */
export interface CreateGameRequest {
  datetimeUTC: ISODateTime;
  courtId: UUID;
  minPlayers?: number;
  maxPlayers?: number;
  minDUPR?: DUPRLevel;
  maxDUPR?: DUPRLevel;
}

/**
 * Request body for updating a game
 */
export interface UpdateGameRequest {
  datetimeUTC?: ISODateTime;
  courtId?: UUID;
  minPlayers?: number;
  maxPlayers?: number;
  minDUPR?: DUPRLevel;
  maxDUPR?: DUPRLevel;
}

/**
 * Request body for updating user profile
 */
export interface UpdateUserProfileRequest {
  name?: string;
  phone?: PhoneNumber;
  dupr?: DUPRLevel;
  notificationPreferences?: NotificationPreferences;
}

/**
 * Request body for creating a new court
 */
export interface CreateCourtRequest {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  courtType: CourtType;
  numberOfCourts: number;
  isReservable: boolean;
  reservationInfo?: string;
  hoursOfOperation?: string;
  amenities?: string[];
  fees?: string;
  website?: URL;
  phone?: PhoneNumber;
  description?: string;
}

/**
 * Request body for updating a court
 */
export interface UpdateCourtRequest {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  courtType?: CourtType;
  numberOfCourts?: number;
  isReservable?: boolean;
  reservationInfo?: string;
  hoursOfOperation?: string;
  amenities?: string[];
  fees?: string;
  website?: URL;
  phone?: PhoneNumber;
  description?: string;
}

/**
 * Query parameters for searching courts
 */
export interface SearchCourtsQuery {
  city?: string;
  state?: string;
  courtType?: CourtType;
  approved?: boolean;
  active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Query parameters for getting available games
 */
export interface GetAvailableGamesQuery {
  city?: string;
  state?: string;
  courtType?: CourtType;
  minDUPR?: DUPRLevel;
  maxDUPR?: DUPRLevel;
  startDate?: ISODateTime;
  endDate?: ISODateTime;
  limit?: number;
  offset?: number;
}

/**
 * Query parameters for getting user schedule
 */
export interface GetUserScheduleQuery {
  range: 'upcoming' | 'past';
  limit?: number;
  offset?: number;
}