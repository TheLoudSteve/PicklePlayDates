import { 
  UUID, 
  EmailAddress, 
  PhoneNumber, 
  ISODateTime, 
  DUPRLevel, 
  UserRole, 
  BaseEntity, 
  DynamoDBKeys 
} from './common';
import { NotificationPreferences } from './notification';

/**
 * User profile entity as stored in DynamoDB
 */
export interface UserProfile extends BaseEntity, DynamoDBKeys {
  userId: UUID;
  email: EmailAddress;
  name: string;
  phone?: PhoneNumber;
  dupr?: DUPRLevel;
  role: UserRole;
  notificationPreferences?: NotificationPreferences;
}

/**
 * User profile for API responses (without DynamoDB internals)
 */
export interface UserProfileResponse extends BaseEntity {
  userId: UUID;
  email: EmailAddress;
  name: string;
  phone?: PhoneNumber;
  dupr?: DUPRLevel;
  role: UserRole;
  notificationPreferences?: NotificationPreferences;
}

/**
 * Public user information for game player lists
 */
export interface PublicUserInfo {
  userId: UUID;
  name: string;
  dupr?: DUPRLevel;
}

/**
 * JWT payload structure from AWS Cognito
 */
export interface JWTPayload {
  sub: UUID;
  email: EmailAddress;
  'cognito:groups'?: string[];
  'cognito:username': string;
  exp: number;
  iat: number;
}

/**
 * User context for authenticated requests
 */
export interface UserContext {
  userId: UUID;
  email: EmailAddress;
  name: string;
  role: UserRole;
  groups: string[];
}