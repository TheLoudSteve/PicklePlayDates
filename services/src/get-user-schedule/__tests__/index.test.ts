import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  createResponse: jest.fn(),
  createErrorResponse: jest.fn(),
  handleError: jest.fn(),
}));

jest.mock('../../shared/dynamodb', () => ({
  getUserSchedule: jest.fn(),
}));

const mockUtils = require('../../shared/utils');
const mockDynamodb = require('../../shared/dynamodb');

describe('Get User Schedule Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUtils.getUserIdFromEvent.mockReturnValue('user-123');
    mockUtils.createResponse.mockReturnValue({ statusCode: 200 });
    mockUtils.createErrorResponse.mockReturnValue({ statusCode: 400 });
    mockUtils.handleError.mockReturnValue({ statusCode: 500 });
  });

  const createMockEvent = (range?: string): APIGatewayProxyEvent => ({
    body: null,
    pathParameters: null,
    queryStringParameters: range ? { range } : null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/users/me/schedule',
    resource: '/users/me/schedule',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  it('should get upcoming games successfully', async () => {
    const mockGames = [
      {
        gameId: 'game-123',
        organizerId: 'user-456',
        datetimeUTC: '2024-01-15T10:30:00.000Z',
        courtName: 'Central Park Courts',
        status: 'scheduled',
      },
      {
        gameId: 'game-456',
        organizerId: 'user-123',
        datetimeUTC: '2024-01-20T14:00:00.000Z',
        courtName: 'Recreation Center',
        status: 'scheduled',
      },
    ];

    mockDynamodb.getUserSchedule.mockResolvedValue(mockGames);

    const event = createMockEvent('upcoming');
    await handler(event);

    expect(mockDynamodb.getUserSchedule).toHaveBeenCalledWith('user-123', 'upcoming');
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      mockGames,
      'Schedule retrieved successfully'
    );
  });

  it('should get past games successfully', async () => {
    const mockGames = [
      {
        gameId: 'game-789',
        organizerId: 'user-123',
        datetimeUTC: '2023-12-15T10:30:00.000Z',
        courtName: 'City Courts',
        status: 'past',
      },
    ];

    mockDynamodb.getUserSchedule.mockResolvedValue(mockGames);

    const event = createMockEvent('past');
    await handler(event);

    expect(mockDynamodb.getUserSchedule).toHaveBeenCalledWith('user-123', 'past');
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      mockGames,
      'Schedule retrieved successfully'
    );
  });

  it('should return 401 if user is not authenticated', async () => {
    mockUtils.getUserIdFromEvent.mockReturnValue(null);

    const event = createMockEvent('upcoming');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(401, 'Unauthorized');
  });

  it('should return 400 if range parameter is missing', async () => {
    const event = createMockEvent();
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Range parameter is required (upcoming or past)'
    );
  });

  it('should return 400 if range parameter is invalid', async () => {
    const event = createMockEvent('invalid');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Range must be either "upcoming" or "past"'
    );
  });

  it('should return empty array if no games found', async () => {
    mockDynamodb.getUserSchedule.mockResolvedValue([]);

    const event = createMockEvent('upcoming');
    await handler(event);

    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      [],
      'Schedule retrieved successfully'
    );
  });

  it('should handle errors gracefully', async () => {
    mockDynamodb.getUserSchedule.mockRejectedValue(new Error('Database error'));

    const event = createMockEvent('upcoming');
    await handler(event);

    expect(mockUtils.handleError).toHaveBeenCalledWith(expect.any(Error));
  });
});