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
  addPlayerToGame, 
  updateGame,
  getUserProfile 
} from '../shared/dynamodb';
import { GamePlayer } from '../shared/types';

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

    // Check if game is joinable (not cancelled, not past, not full, and more than 1 hour before start)
    if (game.status === 'cancelled') {
      return createErrorResponse(409, 'Game has been cancelled');
    }

    if (game.status === 'past') {
      return createErrorResponse(409, 'Game has already ended');
    }

    if (!isGameJoinable(game.datetimeUTC)) {
      return createErrorResponse(409, 'Cannot join game less than 1 hour before start time');
    }

    // Check if game is full
    if (game.currentPlayers >= game.maxPlayers) {
      return createErrorResponse(409, 'Game is full');
    }

    // Check if user is already in the game
    const existingPlayers = await getGamePlayers(gameId);
    const isAlreadyJoined = existingPlayers.some(player => player.userId === userId);
    
    if (isAlreadyJoined) {
      return createErrorResponse(409, 'User is already in this game');
    }

    // Get user profile
    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Check DUPR requirements
    if (game.minDUPR || game.maxDUPR) {
      if (!userProfile.dupr) {
        return createErrorResponse(403, 'DUPR rating required to join this game');
      }

      const duprLevels = ['Below 3', '3 to 3.5', '3.5 to 4', '4 to 4.5', 'Above 4.5'];
      const userDuprIndex = duprLevels.indexOf(userProfile.dupr);

      if (game.minDUPR) {
        const minDuprIndex = duprLevels.indexOf(game.minDUPR);
        if (userDuprIndex < minDuprIndex) {
          return createErrorResponse(403, `DUPR rating too low for this game (requires ${game.minDUPR} or higher)`);
        }
      }

      if (game.maxDUPR) {
        const maxDuprIndex = duprLevels.indexOf(game.maxDUPR);
        if (userDuprIndex > maxDuprIndex) {
          return createErrorResponse(403, `DUPR rating too high for this game (requires ${game.maxDUPR} or lower)`);
        }
      }
    }

    // Add player to game
    const now = formatDateForDDB(new Date());
    const newPlayer: GamePlayer = {
      pk: `GAME#${gameId}`,
      sk: `PLAYER#${userId}`,
      gameId,
      userId,
      userName: userProfile.name,
      joinedAt: now,
      ...(userProfile.dupr && { dupr: userProfile.dupr }),
    };

    await addPlayerToGame(gameId, newPlayer);

    // Update game player count
    await updateGame(gameId, {
      currentPlayers: game.currentPlayers + 1,
      updatedAt: now,
      status: game.currentPlayers + 1 >= game.maxPlayers ? 'closed' : game.status,
    });

    return createResponse(200, {
      message: 'Successfully joined game',
      gameId,
      currentPlayers: game.currentPlayers + 1,
      maxPlayers: game.maxPlayers,
    }, 'Joined game successfully');

  } catch (error) {
    return handleError(error);
  }
}; 