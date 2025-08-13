import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  isAdmin: jest.fn(),
  isOrganiser: jest.fn(),
  parseJWT: jest.fn(),
  createResponse: jest.fn(),
  createErrorResponse: jest.fn(),
  handleError: jest.fn(),
}));

jest.mock('../../shared/dynamodb', () => ({
  getGame: jest.fn(),
  updateGame: jest.fn(),
  getGamePlayers: jest.fn(),
}));

const mockUtils = require('../../shared/utils');
const mockDynamodb = require('../../shared/dynamodb');

describe('Cancel Game Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUtils.getUserIdFromEvent.mockReturnValue('user-123');
    mockUtils.parseJWT.mockReturnValue({ sub: 'user-123', 'cognito:groups': [] });
    mockUtils.isAdmin.mockReturnValue(false);
    mockUtils.isOrganiser.mockReturnValue(false);
    mockUtils.createResponse.mockReturnValue({ statusCode: 200 });
    mockUtils.createErrorResponse.mockReturnValue({ statusCode: 400 });
    mockUtils.handleError.mockReturnValue({ statusCode: 500 });
  });

  const createMockEvent = (gameId: string): APIGatewayProxyEvent => ({
    body: null,
    pathParameters: { gameId },
    queryStringParameters: null,
    headers: { authorization: 'Bearer mock-token' },
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: `/games/${gameId}`,
    resource: '/games/{gameId}',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  it('should cancel game successfully as organizer', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockPlayers = [
      { userId: 'user-123', userName: 'John Doe' },
      { userId: 'user-456', userName: 'Jane Smith' },
    ];

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayers.mockResolvedValue(mockPlayers);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockDynamodb.getGame).toHaveBeenCalledWith('game-123');
    expect(mockDynamodb.updateGame).toHaveBeenCalledWith('game-123', {
      status: 'cancelled',
      updatedAt: expect.any(String),
    });
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ status: 'cancelled' }),
      'Game cancelled successfully'
    );
  });

  it('should cancel game successfully as admin', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456', // Different user
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    mockUtils.isAdmin.mockReturnValue(true);
    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayers.mockResolvedValue([]);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockDynamodb.updateGame).toHaveBeenCalled();
    expect(mockUtils.createResponse).toHaveBeenCalled();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockUtils.getUserIdFromEvent.mockReturnValue(null);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(401, 'Unauthorized');
  });

  it('should return 400 if gameId is missing', async () => {
    const event = createMockEvent('');
    event.pathParameters = null;

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Game ID is required');
  });

  it('should return 404 if game not found', async () => {
    mockDynamodb.getGame.mockResolvedValue(null);

    const event = createMockEvent('non-existent-game');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(404, 'Game not found');
  });

  it('should return 403 if user is not organizer or admin', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456', // Different user
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      403,
      'Only the game organizer or admin can cancel this game'
    );
  });

  it('should return 400 if game is already cancelled', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      status: 'cancelled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Game is already cancelled');
  });

  it('should return 400 if game is in the past', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      status: 'past',
      datetimeUTC: '2023-01-15T10:30:00.000Z',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Cannot cancel a past game');
  });

  it('should handle errors gracefully', async () => {
    mockDynamodb.getGame.mockRejectedValue(new Error('Database error'));

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.handleError).toHaveBeenCalledWith(expect.any(Error));
  });
});