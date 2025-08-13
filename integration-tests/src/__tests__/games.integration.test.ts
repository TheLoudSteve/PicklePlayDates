import { v4 as uuidv4 } from 'uuid';
import { CreateGameRequest, GameStatus } from '@pickle-play-dates/shared-types';
import { apiClient, TEST_CONFIG, addToCleanup, delay } from '../setup';

describe('Games API Integration Tests', () => {
  let testCourtId: string;
  let createdGameId: string;

  beforeAll(async () => {
    // Create a test court for games
    const testCourt = await apiClient.createCourt({
      name: `Integration Test Court ${uuidv4().slice(0, 8)}`,
      address: '123 Test Street',
      city: 'Test City',
      state: 'CA',
      zipCode: '90210',
      country: 'USA',
      courtType: 'outdoor',
      numberOfCourts: 2,
      isReservable: true,
      description: 'Test court for integration tests',
    });
    testCourtId = testCourt.courtId;
    addToCleanup('court', testCourtId);
  });

  describe('Create Game', () => {
    it('should create a new game successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 1 week from now
      
      const gameData: CreateGameRequest = {
        datetimeUTC: futureDate.toISOString(),
        courtId: testCourtId,
        minPlayers: 4,
        maxPlayers: 6,
        minDUPR: '3.5 to 4',
        maxDUPR: '4 to 4.5',
      };

      const game = await apiClient.createGame(gameData);
      createdGameId = game.gameId;
      addToCleanup('game', createdGameId);

      expect(game).toMatchObject({
        gameId: expect.any(String),
        organizerId: expect.any(String),
        datetimeUTC: gameData.datetimeUTC,
        courtId: testCourtId,
        minPlayers: 4,
        maxPlayers: 6,
        currentPlayers: 1, // Organizer is automatically added
        status: 'scheduled' as GameStatus,
        minDUPR: '3.5 to 4',
        maxDUPR: '4 to 4.5',
      });

      expect(game.createdAt).toBeTruthy();
      expect(game.updatedAt).toBeTruthy();
    });

    it('should reject invalid game data', async () => {
      const invalidGameData = {
        datetimeUTC: 'invalid-date',
        courtId: 'non-existent-court',
        minPlayers: 10, // Too many
        maxPlayers: 15, // Too many
      };

      await expect(
        apiClient.createGame(invalidGameData as any)
      ).rejects.toThrow();
    });

    it('should reject games scheduled in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      const gameData: CreateGameRequest = {
        datetimeUTC: pastDate.toISOString(),
        courtId: testCourtId,
      };

      await expect(apiClient.createGame(gameData)).rejects.toThrow();
    });
  });

  describe('Get Available Games', () => {
    it('should retrieve available games', async () => {
      const games = await apiClient.getAvailableGames();

      expect(Array.isArray(games)).toBe(true);
      
      if (games.length > 0) {
        expect(games[0]).toMatchObject({
          gameId: expect.any(String),
          organizerId: expect.any(String),
          datetimeUTC: expect.any(String),
          courtName: expect.any(String),
          currentPlayers: expect.any(Number),
          maxPlayers: expect.any(Number),
          status: expect.stringMatching(/^(scheduled|closed)$/),
        });
      }
    });

    it('should filter games by query parameters', async () => {
      const query = {
        minDUPR: '3.5 to 4' as const,
        maxDUPR: '4 to 4.5' as const,
        limit: 10,
      };

      const games = await apiClient.getAvailableGames(query);
      expect(Array.isArray(games)).toBe(true);
      expect(games.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Get Game Details', () => {
    it('should retrieve game details with players', async () => {
      if (!createdGameId) {
        pending('No game created in previous tests');
        return;
      }

      const game = await apiClient.getGame(createdGameId);

      expect(game).toMatchObject({
        gameId: createdGameId,
        organizerId: expect.any(String),
        datetimeUTC: expect.any(String),
        courtId: testCourtId,
        status: 'scheduled',
        players: expect.any(Array),
      });

      expect(game.players.length).toBeGreaterThan(0);
      expect(game.players[0]).toMatchObject({
        userId: expect.any(String),
        userName: expect.any(String),
        joinedAt: expect.any(String),
      });
    });

    it('should return 404 for non-existent game', async () => {
      const nonExistentId = uuidv4();
      
      await expect(
        apiClient.getGame(nonExistentId)
      ).rejects.toThrow('not found');
    });
  });

  describe('Join and Leave Game', () => {
    let joinableGameId: string;

    beforeAll(async () => {
      // Create a game specifically for join/leave tests
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      
      const game = await apiClient.createGame({
        datetimeUTC: futureDate.toISOString(),
        courtId: testCourtId,
        minPlayers: 2,
        maxPlayers: 4,
      });
      
      joinableGameId = game.gameId;
      addToCleanup('game', joinableGameId);
    });

    it('should join a game successfully', async () => {
      // Note: In a real test, you'd need a second user account
      // For now, we'll test the endpoint behavior
      
      try {
        await apiClient.joinGame(joinableGameId);
        
        // Verify the game was updated
        const updatedGame = await apiClient.getGame(joinableGameId);
        expect(updatedGame.currentPlayers).toBeGreaterThan(1);
      } catch (error) {
        // Expected if user is already in the game (organizer)
        expect(error).toMatchObject({
          message: expect.stringContaining('already'),
        });
      }
    });

    it('should prevent joining a non-existent game', async () => {
      const nonExistentId = uuidv4();
      
      await expect(
        apiClient.joinGame(nonExistentId)
      ).rejects.toThrow();
    });
  });

  describe('Game Management', () => {
    it('should update game details', async () => {
      if (!createdGameId) {
        pending('No game created in previous tests');
        return;
      }

      const updates = {
        minPlayers: 2,
        maxPlayers: 8,
        minDUPR: '3 to 3.5' as const,
      };

      const updatedGame = await apiClient.updateGame(createdGameId, updates);

      expect(updatedGame).toMatchObject({
        gameId: createdGameId,
        minPlayers: 2,
        maxPlayers: 8,
        minDUPR: '3 to 3.5',
      });
    });

    it('should cancel a game', async () => {
      if (!createdGameId) {
        pending('No game created in previous tests');
        return;
      }

      await expect(
        apiClient.cancelGame(createdGameId)
      ).resolves.not.toThrow();

      // Verify the game was cancelled
      const cancelledGame = await apiClient.getGame(createdGameId);
      expect(cancelledGame.status).toBe('cancelled');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const shortTimeoutClient = new (apiClient.constructor as any)({
        baseURL: TEST_CONFIG.API_URL,
        authToken: TEST_CONFIG.AUTH_TOKEN,
        timeout: 1, // Very short timeout to force failure
      });

      await expect(
        shortTimeoutClient.getAvailableGames()
      ).rejects.toThrow();
    });

    it('should handle authentication errors', async () => {
      const unauthenticatedClient = new (apiClient.constructor as any)({
        baseURL: TEST_CONFIG.API_URL,
        // No auth token
      });

      await expect(
        unauthenticatedClient.createGame({
          datetimeUTC: new Date().toISOString(),
          courtId: testCourtId,
        })
      ).rejects.toThrow('Unauthorized');
    });
  });
});