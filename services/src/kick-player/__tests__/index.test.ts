import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  parseJWT: jest.fn(),
  isAdmin: jest.fn(),
  isOrganiser: jest.fn(),
  createResponse: jest.fn(),
  createErrorResponse: jest.fn(),
  handleError: jest.fn(),
}));

jest.mock('../../shared/dynamodb', () => ({
  getGame: jest.fn(),
  getGamePlayer: jest.fn(),
  removePlayerFromGame: jest.fn(),
  updateGame: jest.fn(),
}));

const mockUtils = require('../../shared/utils');
const mockDynamodb = require('../../shared/dynamodb');

describe('Kick Player Lambda', () => {
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

  const createMockEvent = (gameId: string, userId: string): APIGatewayProxyEvent => ({
    body: null,
    pathParameters: { gameId, userId },
    queryStringParameters: null,
    headers: { authorization: 'Bearer mock-token' },
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: `/games/${gameId}/players/${userId}`,
    resource: '/games/{gameId}/players/{userId}',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  it('should kick player successfully as organizer', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      currentPlayers: 3,
      minPlayers: 2,
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-456',
      userName: 'Jane Smith',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);
    mockDynamodb.removePlayerFromGame.mockResolvedValue(undefined);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockDynamodb.getGame).toHaveBeenCalledWith('game-123');
    expect(mockDynamodb.getGamePlayer).toHaveBeenCalledWith('game-123', 'user-456');
    expect(mockDynamodb.removePlayerFromGame).toHaveBeenCalledWith('game-123', 'user-456');
    expect(mockDynamodb.updateGame).toHaveBeenCalledWith('game-123', {
      currentPlayers: 2,
      status: 'scheduled',
      updatedAt: expect.any(String),
    });
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      { gameId: 'game-123', kickedUserId: 'user-456' },
      'Player kicked successfully'
    );
  });

  it('should kick player successfully as admin', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456', // Different user
      currentPlayers: 3,
      minPlayers: 2,
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-789',
      userName: 'Bob Johnson',
    };

    mockUtils.isAdmin.mockReturnValue(true);
    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);
    mockDynamodb.removePlayerFromGame.mockResolvedValue(undefined);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123', 'user-789');
    await handler(event);

    expect(mockDynamodb.removePlayerFromGame).toHaveBeenCalled();
    expect(mockUtils.createResponse).toHaveBeenCalled();
  });

  it('should return 401 if user is not authenticated', async () => {
    mockUtils.getUserIdFromEvent.mockReturnValue(null);

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(401, 'Unauthorized');
  });

  it('should return 400 if gameId is missing', async () => {
    const event = createMockEvent('', 'user-456');
    event.pathParameters = { userId: 'user-456' };

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Game ID and User ID are required');
  });

  it('should return 400 if userId is missing', async () => {
    const event = createMockEvent('game-123', '');
    event.pathParameters = { gameId: 'game-123' };

    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Game ID and User ID are required');
  });

  it('should return 404 if game not found', async () => {
    mockDynamodb.getGame.mockResolvedValue(null);

    const event = createMockEvent('non-existent-game', 'user-456');
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

    const event = createMockEvent('game-123', 'user-789');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      403,
      'Only the game organizer or admin can kick players'
    );
  });

  it('should return 400 if player is not in the game', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(null);

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Player is not in this game');
  });

  it('should return 400 if trying to kick the organizer', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456',
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-456', // Same as organizer
      userName: 'Game Organizer',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'Cannot kick the game organizer');
  });

  it('should return 400 if game is not scheduled', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123',
      status: 'cancelled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-456',
      userName: 'Jane Smith',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Cannot kick players from a cancelled or past game'
    );
  });

  it('should handle errors gracefully', async () => {
    mockDynamodb.getGame.mockRejectedValue(new Error('Database error'));

    const event = createMockEvent('game-123', 'user-456');
    await handler(event);

    expect(mockUtils.handleError).toHaveBeenCalledWith(expect.any(Error));
  });
});