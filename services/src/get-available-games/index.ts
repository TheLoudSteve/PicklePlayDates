import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  handleError 
} from '../shared/utils';
import { getAllAvailableGames } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const games = await getAllAvailableGames();

    // Remove internal DynamoDB fields from response
    const cleanedGames = games.map(game => {
      const {
        pk,
        sk,
        gsi1pk,
        gsi1sk,
        gsi2pk,
        gsi2sk,
        ...gameData
      } = game;
      return gameData;
    });

    return createResponse(200, {
      games: cleanedGames,
      count: cleanedGames.length,
    }, 'Available games retrieved successfully');

  } catch (error) {
    return handleError(error);
  }
};