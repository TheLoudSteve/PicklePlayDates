import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  handleError,
  formatDateForDDB 
} from '../shared/utils';
import { getUserProfile, putUserProfile } from '../shared/dynamodb';
import { UserProfile } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    // Check if user profile already exists
    const existingProfile = await getUserProfile(userId);
    if (existingProfile) {
      return createResponse(200, existingProfile, 'User profile already exists');
    }

    // For now, use simple defaults - we can enhance this later
    // In production, we'd extract name from JWT token or OAuth provider
    const email = `user-${userId}@example.com`;
    const fullName = 'New Player'; // Generic default that encourages profile completion

    const now = formatDateForDDB(new Date());

    // Create new user profile
    const newProfile: UserProfile = {
      pk: `USER#${userId}`,
      sk: 'PROFILE',
      userId,
      email,
      name: fullName,
      role: 'user', // Default role
      createdAt: now,
      updatedAt: now,
    };

    await putUserProfile(newProfile);

    return createResponse(201, newProfile, 'User profile created successfully');

  } catch (error) {
    return handleError(error);
  }
};