export interface Game {
  pk: string; // GAME#<gameId>
  sk: string; // METADATA
  gameId: string;
  organizerId: string;
  datetimeUTC: string; // ISO-8601
  courtId: string;
  courtName: string;
  courtAddress: string;
  latitude?: number;
  longitude?: number;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  gsi1pk?: string; // For GSI queries by court
  gsi1sk?: string;
  gsi2pk?: string; // For GSI queries by user
  gsi2sk?: string;
}

export interface GamePlayer {
  pk: string; // GAME#<gameId>
  sk: string; // PLAYER#<userId>
  gameId: string;
  userId: string;
  userName: string;
  joinedAt: string;
  dupr?: DUPRLevel;
}

export interface UserProfile {
  pk: string; // USER#<userId>
  sk: string; // PROFILE
  userId: string;
  email: string;
  name: string;
  phone?: string; // E.164 format
  dupr?: DUPRLevel;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type GameStatus = 'scheduled' | 'closed' | 'cancelled' | 'past';

export type DUPRLevel = 'Below 3' | '3 to 3.5' | '3.5 to 4' | '4 to 4.5' | 'Above 4.5';

export type CourtType = 'indoor' | 'outdoor' | 'both';
export type CourtSurface = 'concrete' | 'asphalt' | 'sports_court' | 'clay' | 'grass' | 'other';
export type UserRole = 'user' | 'admin';

export interface Court {
  // DynamoDB keys
  pk: string; // COURT#<courtId>
  sk: string; // METADATA
  gsi1pk: string; // LOCATION#<city>
  gsi1sk: string; // COURT#<courtId>
  gsi2pk: string; // USER#<submittedBy>
  gsi2sk: string; // COURT#<courtId>
  
  // Court data
  courtId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  
  // Court details
  courtType: CourtType;
  numberOfCourts: number;
  isReservable: boolean;
  reservationInfo?: string; // How to make reservations
  hoursOfOperation?: string; // Free text for hours
  amenities?: string[]; // ['parking', 'restrooms', 'water', 'lighting', 'nets_provided']
  fees?: string; // Free text for fee information
  website?: string;
  phone?: string;
  description?: string;
  
  // Metadata
  submittedBy: string; // userId who submitted
  submittedByName: string;
  approvedBy?: string; // adminId who approved
  isApproved: boolean;
  isActive: boolean; // For soft deletion
  createdAt: string;
  updatedAt: string;
}

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
  website?: string;
  phone?: string;
  description?: string;
}

export interface APIResponse {
  statusCode: number;
  headers: {
    'Content-Type': string;
    'Access-Control-Allow-Origin': string;
    'Access-Control-Allow-Headers': string;
    'Access-Control-Allow-Methods': string;
  };
  body: string;
}

export interface CreateGameRequest {
  datetimeUTC: string;
  courtId: string;
  minPlayers?: number;
  maxPlayers?: number;
}

export interface UpdateUserProfileRequest {
  name?: string;
  phone?: string;
  dupr?: DUPRLevel;
}

export interface JWTPayload {
  sub: string;
  email: string;
  'cognito:groups'?: string[];
  'cognito:username': string;
  exp: number;
  iat: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

