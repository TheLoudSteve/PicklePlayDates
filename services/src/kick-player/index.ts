import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  isGameJoinable,
  isAdmin,
  handleError,
  parseJWT,
  formatDateForDDB 
} from '../shared/utils';
import { 
  getGame, 
  getGamePlayers, 
  removePlayerFromGame, 
  updateGame 
} from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const gameId = event.pathParameters?.gameId;
    const playerToKickId = event.pathParameters?.userId;
    
    if (!gameId) {
      return createErrorResponse(400, 'Game ID is required');
    }
    
    if (!playerToKickId) {
      return createErrorResponse(400, 'Player ID is required');
    }

    // Get game details
    const game = await getGame(gameId);
    if (!game) {
      return createErrorResponse(404, 'Game not found');
    }

    // Check authorization: only organizer or admin can kick players
    const jwt = parseJWT(event);
    const canKick = game.organizerId === userId || (jwt && isAdmin(jwt));
    
    if (!canKick) {
      return createErrorResponse(403, 'Only the organizer or admin can kick players');
    }

    // Cannot kick yourself
    if (playerToKickId === userId) {
      return createErrorResponse(400, 'Cannot kick yourself');
    }

    // Check if game allows kicking (more than 1 hour before start)
    if (!isGameJoinable(game.datetimeUTC)) {
      return createErrorResponse(409, 'Cannot kick players less than 1 hour before start time');
    }

    // Check if player is in the game
    const players = await getGamePlayers(gameId);
    const playerInGame = players.find(player => player.userId === playerToKickId);
    
    if (!playerInGame) {
      return createErrorResponse(404, 'Player not found in this game');
    }

    // Cannot kick the organizer
    if (playerToKickId === game.organizerId) {
      return createErrorResponse(400, 'Cannot kick the game organizer');
    }

    // Remove player from game
    await removePlayerFromGame(gameId, playerToKickId);

    // Update game player count and status
    const newPlayerCount = game.currentPlayers - 1;
    const now = formatDateForDDB(new Date());
    
    await updateGame(gameId, {
      currentPlayers: newPlayerCount,
      updatedAt: now,
      status: newPlayerCount < game.maxPlayers ? 'scheduled' : game.status,
    });

    return createResponse(200, {
      message: 'Player kicked successfully',
      gameId,
      kickedPlayerId: playerToKickId,
      kickedPlayerName: playerInGame.userName,
      currentPlayers: newPlayerCount,
      maxPlayers: game.maxPlayers,
    }, 'Player kicked successfully');

  } catch (error) {
    return handleError(error);
  }
}; 