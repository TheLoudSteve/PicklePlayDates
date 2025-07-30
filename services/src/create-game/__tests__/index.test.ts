import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  validateDateTime: jest.fn(),
  formatDateForDDB: jest.fn(),
  createResponse: jest.fn(),
  createErrorResponse: jest.fn(),
  handleError: jest.fn(),
}));

jest.mock('../../shared/dynamodb', () => ({
  putGame: jest.fn(),
  getUserProfile: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

const mockUtils = require('../../shared/utils');
const mockDynamodb = require('../../shared/dynamodb');

describe('Create Game Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUtils.getUserIdFromEvent.mockReturnValue('user-123');
    mockUtils.validateDateTime.mockReturnValue(true);
    mockUtils.formatDateForDDB.mockReturnValue('2024-01-15T10:30:00.000Z');
    mockUtils.createResponse.mockReturnValue({ statusCode: 201 });
    mockUtils.createErrorResponse.mockReturnValue({ statusCode: 400 });
    mockUtils.handleError.mockReturnValue({ statusCode: 500 });
  });

  const createMockEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/games',
    resource: '/games',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  it('should create a game successfully', async () => {
    const mockUserProfile = {
      userId: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
      dupr: '3.5',
    };

    mockDynamodb.getUserProfile.mockResolvedValue(mockUserProfile);
    mockDynamodb.putGame.mockResolvedValue(undefined);

    const event = createMockEvent({
      datetimeUTC: '2024-01-15T10:30:00.000Z',
      locationId: 'court-1',
      minPlayers: 4,
      maxPlayers: 6,
    });

    await handler(event);

    expect(mockDynamodb.getUserProfile).toHaveBeenCalledWith('user-123');
    expect(mockDynamodb.putGame).toHaveBeenCalled();
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      201,
      expect.objectContaining({
        organizerId: 'user-123',
        locationId: 'court-1',
        minPlayers: 4,
        maxPlayers: 6,
        currentPlayers: 1,
        status: 'scheduled',
      }),
      'Game created successfully'
    );
  });

  it('should return 401 if user is not authenticated', async () => {
    mockUtils.getUserIdFromEvent.mockReturnValue(null);

    const event = createMockEvent({
      datetimeUTC: '2024-01-15T10:30:00.000Z',
      locationId: 'court-1',
    });

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(401, 'Unauthorized');
  });

  it('should validate required fields', async () => {
    const event = createMockEvent({
      locationId: 'court-1',
      // missing datetimeUTC
    });

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      422,
      'Validation failed',
      expect.arrayContaining([
        expect.objectContaining({
          field: 'datetimeUTC',
          message: 'DateTime is required',
        }),
      ])
    );
  });

  it('should validate datetime format', async () => {
    mockUtils.validateDateTime.mockReturnValue(false);

    const event = createMockEvent({
      datetimeUTC: 'invalid-date',
      locationId: 'court-1',
    });

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      422,
      'Validation failed',
      expect.arrayContaining([
        expect.objectContaining({
          field: 'datetimeUTC',
          message: 'Invalid ISO-8601 datetime format',
        }),
      ])
    );
  });

  it('should validate player limits', async () => {
    const event = createMockEvent({
      datetimeUTC: '2024-01-15T10:30:00.000Z',
      locationId: 'court-1',
      minPlayers: 10, // invalid
      maxPlayers: 15, // invalid
    });

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      422,
      'Validation failed',
      expect.arrayContaining([
        expect.objectContaining({
          field: 'minPlayers',
          message: 'Min players must be between 2 and 8',
        }),
        expect.objectContaining({
          field: 'maxPlayers',
          message: 'Max players must be between min players and 8',
        }),
      ])
    );
  });

  it('should handle user profile not found', async () => {
    mockDynamodb.getUserProfile.mockResolvedValue(null);

    const event = createMockEvent({
      datetimeUTC: '2024-01-15T10:30:00.000Z',
      locationId: 'court-1',
    });

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(404, 'User profile not found');
  });

  it('should handle errors gracefully', async () => {
    mockDynamodb.getUserProfile.mockRejectedValue(new Error('Database error'));

    const event = createMockEvent({
      datetimeUTC: '2024-01-15T10:30:00.000Z',
      locationId: 'court-1',
    });

    await handler(event);

    expect(mockUtils.handleError).toHaveBeenCalledWith(expect.any(Error));
  });
}); 