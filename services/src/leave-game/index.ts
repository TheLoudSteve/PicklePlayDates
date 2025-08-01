import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  isGameJoinable,
  handleError,

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
    if (!gameId) {
      return createErrorResponse(400, 'Game ID is required');
    }

    // Get game details
    const game = await getGame(gameId);
    if (!game) {
      return createErrorResponse(404, 'Game not found');
    }

    // Check if user is the organizer
    if (game.organizerId === userId) {
      return createErrorResponse(400, 'Organizer cannot leave their own game. Cancel the game instead.');
    }

    // Check if game allows leaving (more than 1 hour before start)
    if (!isGameJoinable(game.datetimeUTC)) {
      return createErrorResponse(409, 'Cannot leave game less than 1 hour before start time');
    }

    // Check if user is in the game
    const players = await getGamePlayers(gameId);
    const playerInGame = players.find(player => player.userId === userId);
    
    if (!playerInGame) {
      return createErrorResponse(409, 'User is not in this game');
    }

    // Remove player from game
    await removePlayerFromGame(gameId, userId);

    // Update game player count and status
    const newPlayerCount = game.currentPlayers - 1;
    const now = formatDateForDDB(new Date());
    
    await updateGame(gameId, {
      currentPlayers: newPlayerCount,
      updatedAt: now,
      status: newPlayerCount < game.maxPlayers ? 'scheduled' : game.status,
    });

    return createResponse(200, {
      message: 'Successfully left game',
      gameId,
      currentPlayers: newPlayerCount,
      maxPlayers: game.maxPlayers,
    }, 'Left game successfully');

  } catch (error) {
    return handleError(error);
  }
}; 