/**
 * Common utility types used across the application
 */

// Timestamp in ISO-8601 format
export type ISODateTime = string;

// UUID string
export type UUID = string;

// E.164 phone number format
export type PhoneNumber = string;

// Email address
export type EmailAddress = string;

// URL string
export type URL = string;

// DUPR skill level ratings
export type DUPRLevel = 'Below 3' | '3 to 3.5' | '3.5 to 4' | '4 to 4.5' | 'Above 4.5';

// Game status enum
export type GameStatus = 'scheduled' | 'closed' | 'cancelled' | 'past';

// User role enum
export type UserRole = 'user' | 'admin';

// Court type enum
export type CourtType = 'indoor' | 'outdoor' | 'both';

// Court surface enum
export type CourtSurface = 'concrete' | 'asphalt' | 'sports_court' | 'clay' | 'grass' | 'other';

// Notification preference method
export type NotificationMethod = 'email' | 'in-app';

// Schedule range filter
export type ScheduleRange = 'upcoming' | 'past';

// Validation error structure
export interface ValidationError {
  field: string;
  message: string;
}

// Geographic coordinates
export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Base entity with timestamps
export interface BaseEntity {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// DynamoDB base keys
export interface DynamoDBKeys {
  pk: string;
  sk: string;
}

// GSI keys for DynamoDB
export interface GSIKeys {
  gsi1pk?: string;
  gsi1sk?: string;
  gsi2pk?: string;
  gsi2sk?: string;
}