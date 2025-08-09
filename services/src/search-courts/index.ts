import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  createResponse,
  handleError
} from '../shared/utils';
import { searchCourts, getAllCourts } from '../shared/dynamodb';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const queryParams = event.queryStringParameters || {};
    
    // Extract search parameters
    const city = queryParams.city;
    const latitude = queryParams.latitude ? parseFloat(queryParams.latitude) : undefined;
    const longitude = queryParams.longitude ? parseFloat(queryParams.longitude) : undefined;
    const radius = queryParams.radius ? parseFloat(queryParams.radius) : 50; // Default 50km
    const isApproved = queryParams.isApproved !== 'false'; // Default to true

    let courts;

    if (city || (latitude && longitude)) {
      // Geo search
      courts = await searchCourts({
        ...(city && { city }),
        ...(latitude && { latitude }),
        ...(longitude && { longitude }),
        radius,
        isApproved,
        isActive: true
      });
    } else {
      // Get all courts
      courts = await getAllCourts(isApproved);
    }

    // Remove internal DynamoDB fields from response
    const cleanedCourts = courts.map(court => {
      const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...courtData } = court;
      return courtData;
    });

    return createResponse(200, {
      courts: cleanedCourts,
      count: cleanedCourts.length,
      searchParams: {
        city,
        latitude,
        longitude,
        radius,
        isApproved
      }
    }, 'Courts retrieved successfully');

  } catch (error) {
    return handleError(error);
  }
};