import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { 
  createResponse, 
  createErrorResponse, 
  getUserIdFromEvent,
  validatePhone,
  handleError,
  formatDateForDDB 
} from '../shared/utils';
import { getUserProfile, updateUserProfile } from '../shared/dynamodb';
import { UpdateUserProfileRequest, ValidationError, DUPRLevel } from '../shared/types';

const validDUPRLevels: DUPRLevel[] = ['Below 3', '3 to 3.5', '3.5 to 4', '4 to 4.5', 'Above 4.5'];

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const body = JSON.parse(event.body || '{}') as UpdateUserProfileRequest;
    
    // Validation
    const validationErrors: ValidationError[] = [];
    
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        validationErrors.push({ field: 'name', message: 'Name must be a non-empty string' });
      } else if (body.name.trim().length > 100) {
        validationErrors.push({ field: 'name', message: 'Name must be less than 100 characters' });
      }
    }

    if (body.phone !== undefined) {
      if (body.phone !== null && !validatePhone(body.phone)) {
        validationErrors.push({ field: 'phone', message: 'Phone must be in E.164 format (e.g., +1234567890)' });
      }
    }

    if (body.dupr !== undefined) {
      if (body.dupr !== null && !validDUPRLevels.includes(body.dupr)) {
        validationErrors.push({ 
          field: 'dupr', 
          message: `DUPR level must be one of: ${validDUPRLevels.join(', ')}` 
        });
      }
    }

    if (body.notificationPreferences !== undefined) {
      const notif = body.notificationPreferences;
      if (typeof notif.emailEnabled !== 'boolean') {
        validationErrors.push({ field: 'notificationPreferences.emailEnabled', message: 'emailEnabled must be a boolean' });
      }
      if (typeof notif.gameReminders !== 'boolean') {
        validationErrors.push({ field: 'notificationPreferences.gameReminders', message: 'gameReminders must be a boolean' });
      }
      if (typeof notif.gameCancellations !== 'boolean') {
        validationErrors.push({ field: 'notificationPreferences.gameCancellations', message: 'gameCancellations must be a boolean' });
      }
      if (notif.preferredMethod && !['email', 'in-app'].includes(notif.preferredMethod)) {
        validationErrors.push({ field: 'notificationPreferences.preferredMethod', message: 'preferredMethod must be "email" or "in-app"' });
      }
    }

    if (validationErrors.length > 0) {
      return createErrorResponse(422, 'Validation failed', validationErrors);
    }

    // Check if user profile exists
    const existingProfile = await getUserProfile(userId);
    if (!existingProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Prepare updates
    const updates: any = {
      updatedAt: formatDateForDDB(new Date()),
    };

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }

    if (body.phone !== undefined) {
      updates.phone = body.phone;
    }

    if (body.dupr !== undefined) {
      updates.dupr = body.dupr;
    }

    if (body.notificationPreferences !== undefined) {
      updates.notificationPreferences = body.notificationPreferences;
    }

    // Update profile
    await updateUserProfile(userId, updates);

    // Get updated profile to return
    const updatedProfile = await getUserProfile(userId);
    
    if (!updatedProfile) {
      return createErrorResponse(500, 'Failed to retrieve updated profile');
    }

    // Remove internal DynamoDB fields from response
    const {
      pk,
      sk,
      ...profileData
    } = updatedProfile;

    return createResponse(200, profileData, 'Profile updated successfully');

  } catch (error) {
    return handleError(error);
  }
}; 