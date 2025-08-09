import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  handleError,
  formatDateForDDB
} from '../shared/utils';
import { getUserProfile, updateCourt, getCourt, getAllCourts } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    // Check if user is admin
    const userProfile = await getUserProfile(userId);
    if (!userProfile || userProfile.role !== 'admin') {
      return createErrorResponse(403, 'Forbidden: Admin access required');
    }

    const method = event.httpMethod;
    const courtId = event.pathParameters?.courtId;

    if (method === 'GET') {
      // Get all courts (including unapproved for admin review)
      const includeUnapproved = event.queryStringParameters?.includeUnapproved === 'true';
      const courts = includeUnapproved 
        ? await getAllCourts(false) // Get all courts regardless of approval
        : await getAllCourts(true); // Get only approved courts

      // Remove internal DynamoDB fields
      const cleanedCourts = courts.map(court => {
        const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...courtData } = court;
        return courtData;
      });

      return createResponse(200, {
        courts: cleanedCourts,
        count: cleanedCourts.length
      }, 'Courts retrieved successfully');
    }

    if (method === 'PUT') {
      // Update court (approve, edit, or deactivate)
      if (!courtId) {
        return createErrorResponse(400, 'Court ID is required');
      }

      const body = JSON.parse(event.body || '{}');
      const updates: any = { updatedAt: formatDateForDDB(new Date()) };

      // Admin can update any field
      if (body.isApproved !== undefined) {
        updates.isApproved = body.isApproved;
        if (body.isApproved) {
          updates.approvedBy = userId;
        }
      }
      
      if (body.isActive !== undefined) {
        updates.isActive = body.isActive;
      }

      // Allow admin to edit court details
      const editableFields = [
        'name', 'address', 'city', 'state', 'zipCode', 'country',
        'latitude', 'longitude', 'courtType', 'surface', 'numberOfCourts',
        'isReservable', 'reservationInfo', 'hoursOfOperation', 'amenities',
        'fees', 'website', 'phone', 'description'
      ];

      editableFields.forEach(field => {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      });

      await updateCourt(courtId, updates);

      const updatedCourt = await getCourt(courtId);
      if (!updatedCourt) {
        return createErrorResponse(404, 'Court not found');
      }

      // Remove internal DynamoDB fields
      const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...courtData } = updatedCourt;

      return createResponse(200, courtData, 'Court updated successfully');
    }

    if (method === 'DELETE') {
      // Soft delete court
      if (!courtId) {
        return createErrorResponse(400, 'Court ID is required');
      }

      await updateCourt(courtId, {
        isActive: false,
        updatedAt: formatDateForDDB(new Date())
      });

      return createResponse(200, { courtId }, 'Court deleted successfully');
    }

    return createErrorResponse(405, 'Method not allowed');

  } catch (error) {
    return handleError(error);
  }
};