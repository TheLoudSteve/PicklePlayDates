import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createResponse, createErrorResponse, handleError } from '../shared/utils';
import { getGame, getGamePlayers } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const gameId = event.pathParameters?.gameId;
    
    if (!gameId) {
      return createErrorResponse(400, 'Game ID is required');
    }

    const game = await getGame(gameId);
    
    if (!game) {
      return createErrorResponse(404, 'Game not found');
    }

    const players = await getGamePlayers(gameId);

    // Remove internal DynamoDB fields from response
    const {
      pk,
      sk,
      gsi1pk,
      gsi1sk,
      gsi2pk,
      gsi2sk,
      ...gameData
    } = game;

    const response = {
      ...gameData,
      players: players.map(player => ({
        userId: player.userId,
        userName: player.userName,
        joinedAt: player.joinedAt,
        dupr: player.dupr,
      })),
    };

    return createResponse(200, response, 'Game retrieved successfully');

  } catch (error) {
    return handleError(error);
  }
}; 