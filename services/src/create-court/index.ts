import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  handleError,
  formatDateForDDB,
  geocodeAddress
} from '../shared/utils';
import { putCourt, getUserProfile } from '../shared/dynamodb';
import { Court, CreateCourtRequest } from '../shared/types';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      return createErrorResponse(401, 'Unauthorized');
    }

    const body = JSON.parse(event.body || '{}') as CreateCourtRequest;
    
    // Validation
    const validationErrors: { field: string; message: string }[] = [];

    if (!body.name?.trim()) {
      validationErrors.push({ field: 'name', message: 'Court name is required' });
    }
    if (!body.address?.trim()) {
      validationErrors.push({ field: 'address', message: 'Address is required' });
    }
    if (!body.city?.trim()) {
      validationErrors.push({ field: 'city', message: 'City is required' });
    }
    if (!body.state?.trim()) {
      validationErrors.push({ field: 'state', message: 'State is required' });
    }
    if (!body.zipCode?.trim()) {
      validationErrors.push({ field: 'zipCode', message: 'Zip code is required' });
    }
    if (!body.country?.trim()) {
      validationErrors.push({ field: 'country', message: 'Country is required' });
    }

    if (!['indoor', 'outdoor', 'both'].includes(body.courtType)) {
      validationErrors.push({ field: 'courtType', message: 'Court type must be indoor, outdoor, or both' });
    }
    if (typeof body.numberOfCourts !== 'number' || body.numberOfCourts < 1 || body.numberOfCourts > 50) {
      validationErrors.push({ field: 'numberOfCourts', message: 'Number of courts must be between 1 and 50' });
    }

    if (validationErrors.length > 0) {
      return createErrorResponse(422, 'Validation failed', validationErrors);
    }

    // Get user profile for name
    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return createErrorResponse(404, 'User profile not found');
    }

    // Geocode the address to get coordinates
    let coordinates: { latitude: number; longitude: number };
    try {
      coordinates = await geocodeAddress(
        body.address.trim(),
        body.city.trim(),
        body.state.trim(),
        body.zipCode.trim(),
        body.country.trim()
      );
    } catch (geocodeError: any) {
      return createErrorResponse(400, `Geocoding failed: ${geocodeError.message || 'Unknown error'}`);
    }

    const courtId = uuidv4();
    const now = formatDateForDDB(new Date());

    const court: Court = {
      pk: `COURT#${courtId}`,
      sk: 'METADATA',
      gsi1pk: `LOCATION#${body.city.toLowerCase().replace(/\s+/g, '-')}`,
      gsi1sk: `COURT#${courtId}`,
      gsi2pk: `USER#${userId}`,
      gsi2sk: `COURT#${courtId}`,
      
      courtId,
      name: body.name.trim(),
      address: body.address.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      zipCode: body.zipCode.trim(),
      country: body.country.trim(),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      
      courtType: body.courtType,
      numberOfCourts: body.numberOfCourts,
      isReservable: body.isReservable,
      ...(body.reservationInfo && { reservationInfo: body.reservationInfo.trim() }),
      ...(body.hoursOfOperation && { hoursOfOperation: body.hoursOfOperation.trim() }),
      amenities: body.amenities || [],
      ...(body.fees && { fees: body.fees.trim() }),
      ...(body.website && { website: body.website.trim() }),
      ...(body.phone && { phone: body.phone.trim() }),
      ...(body.description && { description: body.description.trim() }),
      
      submittedBy: userId,
      submittedByName: userProfile.name,
      isApproved: false, // Requires admin approval
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await putCourt(court);

    // Remove internal DynamoDB fields from response
    const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, ...courtData } = court;

    return createResponse(201, courtData, 'Court submitted successfully and is pending approval');

  } catch (error) {
    return handleError(error);
  }
};