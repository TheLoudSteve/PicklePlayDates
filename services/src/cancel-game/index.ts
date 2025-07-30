import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  isGameInFuture,
  isAdmin,
  handleError,
  parseJWT,
  formatDateForDDB 
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

    // Get game details
    const game = await getGame(gameId);
    if (!game) {
      return createErrorResponse(404, 'Game not found');
    }

    // Check authorization: only organizer or admin can cancel
    const jwt = parseJWT(event);
    const canCancel = game.organizerId === userId || (jwt && isAdmin(jwt));
    
    if (!canCancel) {
      return createErrorResponse(403, 'Only the organizer or admin can cancel this game');
    }

    // Check if game can be cancelled (must be in the future and not already cancelled)
    if (game.status === 'cancelled') {
      return createErrorResponse(409, 'Game is already cancelled');
    }

    if (game.status === 'past') {
      return createErrorResponse(409, 'Cannot cancel a game that has already ended');
    }

    if (!isGameInFuture(game.datetimeUTC)) {
      return createErrorResponse(409, 'Cannot cancel a game that has already started');
    }

    // Update game status to cancelled
    const now = formatDateForDDB(new Date());
    await updateGame(gameId, {
      status: 'cancelled',
      updatedAt: now,
    });

    return createResponse(200, {
      message: 'Game cancelled successfully',
      gameId,
      status: 'cancelled',
      cancelledAt: now,
    }, 'Game cancelled successfully');

  } catch (error) {
    return handleError(error);
  }
}; 