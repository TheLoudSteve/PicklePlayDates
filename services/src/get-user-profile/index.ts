import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  handleError 
} from '../shared/utils';
import { getUserProfile } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Remove internal DynamoDB fields from response
    const {
      pk,
      sk,
      ...profileData
    } = userProfile;

    return createResponse(200, profileData, 'User profile retrieved successfully');

  } catch (error) {
    return handleError(error);
  }
};