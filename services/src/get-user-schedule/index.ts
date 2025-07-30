import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  handleError 
} from '../shared/utils';
import { getUserGames } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const range = event.queryStringParameters?.range as 'upcoming' | 'past';
    
    if (!range || (range !== 'upcoming' && range !== 'past')) {
      return createErrorResponse(400, 'Range parameter must be "upcoming" or "past"');
    }

    const games = await getUserGames(userId, range);

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
      range,
      games: cleanedGames,
      count: cleanedGames.length,
    }, `${range} games retrieved successfully`);

  } catch (error) {
    return handleError(error);
  }
}; 