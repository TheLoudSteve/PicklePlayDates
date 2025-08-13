import { 
  UUID, 
  ISODateTime, 
  GameStatus, 
  DUPRLevel, 
  Coordinates, 
  BaseEntity, 
  DynamoDBKeys, 
  GSIKeys 
} from './common';

/**
 * Core game entity as stored in DynamoDB
 */
export interface Game extends BaseEntity, DynamoDBKeys, GSIKeys {
  gameId: UUID;
  organizerId: UUID;
  datetimeUTC: ISODateTime;
  courtId: UUID;
  courtName: string;
  courtAddress: string;
  latitude?: number;
  longitude?: number;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  minDUPR?: DUPRLevel;
  maxDUPR?: DUPRLevel;
}

/**
 * Game player relationship entity
 */
export interface GamePlayer extends DynamoDBKeys {
  gameId: UUID;
  userId: UUID;
  userName: string;
  joinedAt: ISODateTime;
  dupr?: DUPRLevel;
}

/**
 * Cleaned game data for API responses (without DynamoDB internals)
 */
export interface GameResponse extends BaseEntity {
  gameId: UUID;
  organizerId: UUID;
  datetimeUTC: ISODateTime;
  courtId: UUID;
  courtName: string;
  courtAddress: string;
  latitude?: number;
  longitude?: number;
  minPlayers: number;
  maxPlayers: number;
  currentPlayers: number;
  status: GameStatus;
  minDUPR?: DUPRLevel;
  maxDUPR?: DUPRLevel;
}

/**
 * Game with player information included
 */
export interface GameWithPlayers extends GameResponse {
  players: GamePlayerResponse[];
}

/**
 * Game player for API responses
 */
export interface GamePlayerResponse {
  userId: UUID;
  userName: string;
  joinedAt: ISODateTime;
  dupr?: DUPRLevel;
}

/**
 * Game summary for list views
 */
export interface GameSummary {
  gameId: UUID;
  organizerId: UUID;
  datetimeUTC: ISODateTime;
  courtName: string;
  currentPlayers: number;
  maxPlayers: number;
  status: GameStatus;
  isUserJoined?: boolean;
}