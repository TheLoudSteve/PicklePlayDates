export interface Game {
  pk: string; // GAME#<gameId>
  sk: string; // METADATA
  gameId: string;
  organizerId: string;
  datetimeUTC: string; // ISO-8601
  locationId: string;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  gsi1pk?: string; // For GSI queries
  gsi1sk?: string;
  gsi2pk?: string;
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
  createdAt: string;
  updatedAt: string;
}

export type GameStatus = 'scheduled' | 'closed' | 'cancelled' | 'past';

export type DUPRLevel = '3.0' | '3.5' | '4.0+';

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
  locationId: string;
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

