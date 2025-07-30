import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../index';

// Mock the dependencies
jest.mock('../../shared/utils', () => ({
  ...jest.requireActual('../../shared/utils'),
  getUserIdFromEvent: jest.fn(),
  isGameJoinable: jest.fn(),
  formatDateForDDB: jest.fn(),
  createResponse: jest.fn(),
  createErrorResponse: jest.fn(),
  handleError: jest.fn(),
}));

jest.mock('../../shared/dynamodb', () => ({
  getGame: jest.fn(),
  getGamePlayers: jest.fn(),
  addPlayerToGame: jest.fn(),
  updateGame: jest.fn(),
  getUserProfile: jest.fn(),
}));

const mockUtils = require('../../shared/utils');
const mockDynamodb = require('../../shared/dynamodb');

describe('Join Game Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUtils.getUserIdFromEvent.mockReturnValue('user-123');
    mockUtils.isGameJoinable.mockReturnValue(true);
    mockUtils.formatDateForDDB.mockReturnValue('2024-01-15T10:30:00.000Z');
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
    path: `/games/${gameId}/join`,
    resource: '/games/{gameId}/join',
    requestContext: {} as any,
    stageVariables: null,
    multiValueQueryStringParameters: null,
  });

  const mockGame = {
    gameId: 'game-123',
    organizerId: 'organizer-456',
    status: 'scheduled',
    currentPlayers: 2,
    maxPlayers: 6,
    datetimeUTC: '2024-01-15T10:30:00.000Z',
  };

  const mockUserProfile = {
    userId: 'user-123',
    name: 'John Doe',
    email: 'john@example.com',
    dupr: '3.5',
  };

  it('should join a game successfully', async () => {
    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayers.mockResolvedValue([]);
    mockDynamodb.getUserProfile.mockResolvedValue(mockUserProfile);
    mockDynamodb.addPlayerToGame.mockResolvedValue(undefined);
    mockDynamodb.updateGame.mockResolvedValue(undefined);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockDynamodb.addPlayerToGame).toHaveBeenCalledWith(
      'game-123',
      expect.objectContaining({
        userId: 'user-123',
        userName: 'John Doe',
        dupr: '3.5',
      })
    );

    expect(mockDynamodb.updateGame).toHaveBeenCalledWith(
      'game-123',
      expect.objectContaining({
        currentPlayers: 3,
        status: 'scheduled',
      })
    );

    expect(mockUtils.createResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        currentPlayers: 3,
        maxPlayers: 6,
      }),
      'Joined game successfully'
    );
  });

  it('should return 401 if user is not authenticated', async () => {
    mockUtils.getUserIdFromEvent.mockReturnValue(null);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(401, 'Unauthorized');
  });

  it('should return 404 if game not found', async () => {
    mockDynamodb.getGame.mockResolvedValue(null);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(404, 'Game not found');
  });

  it('should reject joining cancelled game', async () => {
    mockDynamodb.getGame.mockResolvedValue({
      ...mockGame,
      status: 'cancelled',
    });

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(409, 'Game has been cancelled');
  });

  it('should reject joining past game', async () => {
    mockDynamodb.getGame.mockResolvedValue({
      ...mockGame,
      status: 'past',
    });

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(409, 'Game has already ended');
  });

  it('should reject joining game too close to start time', async () => {
    mockUtils.isGameJoinable.mockReturnValue(false);
    mockDynamodb.getGame.mockResolvedValue(mockGame);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      409,
      'Cannot join game less than 1 hour before start time'
    );
  });

  it('should reject joining full game', async () => {
    mockDynamodb.getGame.mockResolvedValue({
      ...mockGame,
      currentPlayers: 6,
      maxPlayers: 6,
    });

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(409, 'Game is full');
  });

  it('should reject if user already joined', async () => {
    mockDynamodb.getGame.mockResolvedValue(mockGame);
    mockDynamodb.getGamePlayers.mockResolvedValue([
      { userId: 'user-123', userName: 'John Doe' },
    ]);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockUtils.createErrorResponse).toHaveBeenCalledWith(
      409,
      'User is already in this game'
    );
  });

  it('should close game when it becomes full', async () => {
    mockDynamodb.getGame.mockResolvedValue({
      ...mockGame,
      currentPlayers: 5,
      maxPlayers: 6,
    });
    mockDynamodb.getGamePlayers.mockResolvedValue([]);
    mockDynamodb.getUserProfile.mockResolvedValue(mockUserProfile);

    const event = createMockEvent('game-123');
    await handler(event);

    expect(mockDynamodb.updateGame).toHaveBeenCalledWith(
      'game-123',
      expect.objectContaining({
        currentPlayers: 6,
        status: 'closed', // Should be closed when full
      })
    );
  });
}); 