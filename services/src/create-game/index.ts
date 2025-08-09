import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  validateDateTime,
  handleError,

  formatDateForDDB 
} from '../shared/utils';
import { putGame, getUserProfile, addPlayerToGame, getCourt } from '../shared/dynamodb';
import { Game, CreateGameRequest, ValidationError, GamePlayer } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const body = JSON.parse(event.body || '{}') as CreateGameRequest;
    
    // Validation
    const validationErrors: ValidationError[] = [];
    
    if (!body.datetimeUTC) {
      validationErrors.push({ field: 'datetimeUTC', message: 'DateTime is required' });
    } else if (!validateDateTime(body.datetimeUTC)) {
      validationErrors.push({ field: 'datetimeUTC', message: 'Invalid ISO-8601 datetime format' });
    } else {
      const gameTime = new Date(body.datetimeUTC);
      const now = new Date();
      if (gameTime <= now) {
        validationErrors.push({ field: 'datetimeUTC', message: 'Game time must be in the future' });
      }
    }

    if (!body.courtId) {
      validationErrors.push({ field: 'courtId', message: 'Court ID is required' });
    }

    const minPlayers = body.minPlayers || 4;
    const maxPlayers = body.maxPlayers || 6;

    if (minPlayers < 2 || minPlayers > 8) {
      validationErrors.push({ field: 'minPlayers', message: 'Min players must be between 2 and 8' });
    }

    if (maxPlayers < minPlayers || maxPlayers > 8) {
      validationErrors.push({ field: 'maxPlayers', message: 'Max players must be between min players and 8' });
    }

    if (validationErrors.length > 0) {
      return createErrorResponse(422, 'Validation failed', validationErrors);
    }

    // Get user profile to get their name
    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Get court information
    const court = await getCourt(body.courtId);
    if (!court) {
      return createErrorResponse(404, 'Court not found');
    }

    if (!court.isApproved || !court.isActive) {
      return createErrorResponse(400, 'Court is not available for games');
    }

    // Create game
    const gameId = `game_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const now = formatDateForDDB(new Date());

    const game: Game = {
      pk: `GAME#${gameId}`,
      sk: 'METADATA',
      gameId,
      organizerId: userId,
      datetimeUTC: body.datetimeUTC,
      courtId: body.courtId,
      courtName: court.name,
      courtAddress: court.address,
      latitude: court.latitude,
      longitude: court.longitude,
      minPlayers,
      maxPlayers,
      currentPlayers: 1, // Organizer is automatically in the game
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
      gsi1pk: `COURT#${body.courtId}`,
      gsi1sk: `GAME#${body.datetimeUTC}`,
      gsi2pk: `USER#${userId}`,
      gsi2sk: `GAME#${body.datetimeUTC}`,
    };

    await putGame(game);

    // Add organizer as first player
    const organizer: GamePlayer = {
      pk: `GAME#${gameId}`,
      sk: `PLAYER#${userId}`,
      gameId,
      userId,
      userName: userProfile.name,
      joinedAt: now,
      ...(userProfile.dupr && { dupr: userProfile.dupr }),
    };

    await addPlayerToGame(gameId, organizer);

    // Note: In real implementation, we'd use a transaction to ensure both operations succeed
    // For simplicity, we're doing separate operations here

    return createResponse(201, {
      gameId,
      organizerId: userId,
      datetimeUTC: body.datetimeUTC,
      courtId: body.courtId,
      courtName: court.name,
      courtAddress: court.address,
      latitude: court.latitude,
      longitude: court.longitude,
      minPlayers,
      maxPlayers,
      currentPlayers: 1,
      status: 'scheduled',
      createdAt: now,
    }, 'Game created successfully');

  } catch (error) {
    return handleError(error);
  }
}; 