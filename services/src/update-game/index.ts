import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  validateDateTime,
  handleError 
} from '../shared/utils';
import { getGame, updateGame } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const gameId = event.pathParameters?.gameId;
    if (!gameId) {
      return createErrorResponse(400, 'Game ID is required');
    }

    const body = JSON.parse(event.body || '{}');

    // Get the existing game
    const existingGame = await getGame(gameId);
    if (!existingGame) {
      return createErrorResponse(404, 'Game not found');
    }

    // Check if user is the organizer
    if (existingGame.organizerId !== userId) {
      return createErrorResponse(403, 'Only the game organizer can modify the game');
    }

    // Validation
    const validationErrors = [];
    
    if (body.datetimeUTC && !validateDateTime(body.datetimeUTC)) {
      validationErrors.push({ field: 'datetimeUTC', message: 'Invalid ISO-8601 datetime format' });
    }

    if (body.minPlayers && (body.minPlayers < 2 || body.minPlayers > 12)) {
      validationErrors.push({ field: 'minPlayers', message: 'Minimum players must be between 2 and 12' });
    }

    if (body.maxPlayers && (body.maxPlayers < 2 || body.maxPlayers > 12)) {
      validationErrors.push({ field: 'maxPlayers', message: 'Maximum players must be between 2 and 12' });
    }

    if (body.minPlayers && body.maxPlayers && body.minPlayers > body.maxPlayers) {
      validationErrors.push({ field: 'maxPlayers', message: 'Maximum players must be greater than or equal to minimum players' });
    }

    // Check if reducing maxPlayers would kick out existing players
    if (body.maxPlayers && body.maxPlayers < existingGame.currentPlayers) {
      validationErrors.push({ 
        field: 'maxPlayers', 
        message: `Cannot reduce max players below current player count (${existingGame.currentPlayers})` 
      });
    }

    // Validate DUPR range if provided
    const validDuprLevels = ['Below 3', '3 to 3.5', '3.5 to 4', '4 to 4.5', 'Above 4.5'];
    if (body.minDUPR && !validDuprLevels.includes(body.minDUPR)) {
      validationErrors.push({ field: 'minDUPR', message: 'Invalid minimum DUPR level' });
    }
    if (body.maxDUPR && !validDuprLevels.includes(body.maxDUPR)) {
      validationErrors.push({ field: 'maxDUPR', message: 'Invalid maximum DUPR level' });
    }

    // Validate DUPR range logic
    if (body.minDUPR && body.maxDUPR) {
      const minIndex = validDuprLevels.indexOf(body.minDUPR);
      const maxIndex = validDuprLevels.indexOf(body.maxDUPR);
      if (minIndex > maxIndex) {
        validationErrors.push({
          field: 'maxDUPR',
          message: `Maximum DUPR (${body.maxDUPR}) cannot be lower than minimum DUPR (${body.minDUPR}). Please adjust your DUPR range.`
        });
      }
    }

    if (validationErrors.length > 0) {
      return createErrorResponse(400, 'Validation failed', validationErrors);
    }

    // Prepare updates
    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (body.datetimeUTC) updates.datetimeUTC = body.datetimeUTC;
    if (body.locationId) updates.locationId = body.locationId;
    if (body.minPlayers) updates.minPlayers = body.minPlayers;
    if (body.maxPlayers) updates.maxPlayers = body.maxPlayers;
    if (body.minDUPR !== undefined) updates.minDUPR = body.minDUPR || null;
    if (body.maxDUPR !== undefined) updates.maxDUPR = body.maxDUPR || null;

    // Update the game
    await updateGame(gameId, updates);

    // Get the updated game
    const updatedGame = await getGame(gameId);

    // Remove internal DynamoDB fields from response
    const {
      pk,
      sk,
      gsi1pk,
      gsi1sk,
      gsi2pk,
      gsi2sk,
      ...gameData
    } = updatedGame!;

    return createResponse(200, gameData, 'Game updated successfully');

  } catch (error) {
    return handleError(error);
  }
};