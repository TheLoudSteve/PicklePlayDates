import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  isGameJoinable: jest.fn(),
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

describe('Leave Game Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUtils.getUserIdFromEvent.mockReturnValue('user-123');
    mockUtils.isGameJoinable.mockReturnValue(true);
    mockUtils.createResponse.mockReturnValue({ statusCode: 200 });
    mockUtils.createErrorResponse.mockReturnValue({ statusCode: 400 });
    mockUtils.handleError.mockReturnValue({ statusCode: 500 });
  });

  const createMockEvent = (gameId: string): APIGatewayProxyEvent => ({
    body: null,
    pathParameters: { gameId },
    queryStringParameters: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/games/${gameId}/leave`,
    resource: '/games/{gameId}/leave',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  it('should leave game successfully', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456',
      currentPlayers: 3,
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-123',
      userName: 'John Doe',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);
    mockDynamodb.removePlayerFromGame.mockResolvedValue(undefined);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockDynamodb.getGame).toHaveBeenCalledWith('game-123');
    expect(mockDynamodb.getGamePlayer).toHaveBeenCalledWith('game-123', 'user-123');
    expect(mockDynamodb.removePlayerFromGame).toHaveBeenCalledWith('game-123', 'user-123');
    expect(mockDynamodb.updateGame).toHaveBeenCalledWith('game-123', {
      currentPlayers: 2,
      status: 'scheduled', // Should remain scheduled if not below min
      updatedAt: expect.any(String),
    });
    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      { gameId: 'game-123' },
      'Successfully left the game'
    );
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

  it('should return 400 if user is not in the game', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456',
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(null);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(400, 'You are not in this game');
  });

  it('should return 400 if too late to leave', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456',
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-123',
      userName: 'John Doe',
    };

    mockUtils.isGameJoinable.mockReturnValue(false);
    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Cannot leave game less than 1 hour before start time'
    );
  });

  it('should return 400 if game is not scheduled', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-456',
      status: 'cancelled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-123',
      userName: 'John Doe',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Cannot leave a cancelled or past game'
    );
  });

  it('should prevent organizer from leaving their own game', async () => {
    const mockGame = {
      gameId: 'game-123',
      organizerId: 'user-123', // Same as current user
      status: 'scheduled',
      datetimeUTC: '2024-01-15T10:30:00.000Z',
    };

    const mockGamePlayer = {
      gameId: 'game-123',
      userId: 'user-123',
      userName: 'John Doe',
    };

    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayer.mockResolvedValue(mockGamePlayer);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      400,
      'Game organizer cannot leave their own game. Cancel the game instead.'
    );
  });

  it('should handle errors gracefully', async () => {
    mockDynamodb.getGame.mockRejectedValue(new Error('Database error'));

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.handleError).toHaveBeenCalledWith(expect.any(Error));
  });
});