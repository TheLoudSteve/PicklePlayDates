import { UpdateUserProfileRequest } from '@pickle-play-dates/shared-types';
import { apiClient, TEST_CONFIG } from '../setup';

describe('Users API Integration Tests', () => {
  let originalProfile: any;

  beforeAll(async () => {
    // Get the original profile to restore later
    originalProfile = await apiClient.getUserProfile();
  });

  afterAll(async () => {
    // Restore original profile
    if (originalProfile) {
      try {
        await apiClient.updateUserProfile({
          name: originalProfile.name,
          phone: originalProfile.phone,
          dupr: originalProfile.dupr,
          notificationPreferences: originalProfile.notificationPreferences,
        });
      } catch (error) {
        console.warn('Failed to restore original profile:', error);
      }
    }
  });

  describe('Get User Profile', () => {
    it('should retrieve the current user profile', async () => {
      const profile = await apiClient.getUserProfile();

      expect(profile).toMatchObject({
        userId: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
        role: expect.stringMatching(/^(user|admin)$/),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Optional fields should be properly typed if present
      if (profile.phone) {
        expect(profile.phone).toMatch(/^\+[1-9]\d{1,14}$/);
      }

      if (profile.dupr) {
        expect(profile.dupr).toMatch(/^(Below 3|3 to 3\.5|3\.5 to 4|4 to 4\.5|Above 4\.5)$/);
      }
    });

    it('should fail without authentication', async () => {
      const unauthenticatedClient = new (apiClient.constructor as any)({
        baseURL: TEST_CONFIG.API_URL,
        // No auth token
      });

      await expect(
        unauthenticatedClient.getUserProfile()
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('Update User Profile', () => {
    it('should update user name', async () => {
      const newName = `Test User ${Date.now()}`;
      
      const updates: UpdateUserProfileRequest = {
        name: newName,
      };

      const updatedProfile = await apiClient.updateUserProfile(updates);

      expect(updatedProfile.name).toBe(newName);
      expect(updatedProfile.updatedAt).not.toBe(originalProfile.updatedAt);
    });

    it('should update phone number', async () => {
      const newPhone = '+15551234567';
      
      const updates: UpdateUserProfileRequest = {
        phone: newPhone,
      };

      const updatedProfile = await apiClient.updateUserProfile(updates);

      expect(updatedProfile.phone).toBe(newPhone);
    });

    it('should update DUPR level', async () => {
      const newDUPR = '4 to 4.5' as const;
      
      const updates: UpdateUserProfileRequest = {
        dupr: newDUPR,
      };

      const updatedProfile = await apiClient.updateUserProfile(updates);

      expect(updatedProfile.dupr).toBe(newDUPR);
    });

    it('should update notification preferences', async () => {
      const newPreferences = {
        emailEnabled: true,
        gameReminders: false,
        gameCancellations: true,
        preferredMethod: 'email' as const,
      };
      
      const updates: UpdateUserProfileRequest = {
        notificationPreferences: newPreferences,
      };

      const updatedProfile = await apiClient.updateUserProfile(updates);

      expect(updatedProfile.notificationPreferences).toMatchObject(newPreferences);
    });

    it('should reject invalid phone number format', async () => {
      const invalidPhone = '123-456-7890'; // US format, not E.164
      
      const updates: UpdateUserProfileRequest = {
        phone: invalidPhone,
      };

      await expect(
        apiClient.updateUserProfile(updates)
      ).rejects.toThrow();
    });

    it('should reject invalid DUPR level', async () => {
      const updates = {
        dupr: 'Invalid Level',
      };

      await expect(
        apiClient.updateUserProfile(updates as any)
      ).rejects.toThrow();
    });

    it('should handle partial updates', async () => {
      const originalName = originalProfile.name;
      
      // Update only phone, name should remain the same
      const updates: UpdateUserProfileRequest = {
        phone: '+15559876543',
      };

      const updatedProfile = await apiClient.updateUserProfile(updates);

      expect(updatedProfile.phone).toBe('+15559876543');
      expect(updatedProfile.name).toBe(originalName);
    });
  });

  describe('User Schedule', () => {
    it('should retrieve upcoming games', async () => {
      const upcomingGames = await apiClient.getUserSchedule('upcoming');

      expect(Array.isArray(upcomingGames)).toBe(true);

      if (upcomingGames.length > 0) {
        expect(upcomingGames[0]).toMatchObject({
          gameId: expect.any(String),
          organizerId: expect.any(String),
          datetimeUTC: expect.any(String),
          courtName: expect.any(String),
          currentPlayers: expect.any(Number),
          maxPlayers: expect.any(Number),
          status: expect.stringMatching(/^(scheduled|closed)$/),
        });

        // Verify the date is in the future
        const gameDate = new Date(upcomingGames[0].datetimeUTC);
        expect(gameDate.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should retrieve past games', async () => {
      const pastGames = await apiClient.getUserSchedule('past');

      expect(Array.isArray(pastGames)).toBe(true);

      if (pastGames.length > 0) {
        expect(pastGames[0]).toMatchObject({
          gameId: expect.any(String),
          organizerId: expect.any(String),
          datetimeUTC: expect.any(String),
          courtName: expect.any(String),
          status: expect.stringMatching(/^(past|cancelled)$/),
        });

        // Verify the date is in the past (unless it's cancelled)
        if (pastGames[0].status === 'past') {
          const gameDate = new Date(pastGames[0].datetimeUTC);
          expect(gameDate.getTime()).toBeLessThan(Date.now());
        }
      }
    });

    it('should handle pagination parameters', async () => {
      const limitedGames = await apiClient.getUserSchedule('upcoming', {
        limit: 5,
        offset: 0,
      });

      expect(Array.isArray(limitedGames)).toBe(true);
      expect(limitedGames.length).toBeLessThanOrEqual(5);
    });

    it('should reject invalid range parameter', async () => {
      await expect(
        apiClient.getUserSchedule('invalid' as any)
      ).rejects.toThrow();
    });
  });

  describe('Profile Data Validation', () => {
    it('should validate name length constraints', async () => {
      // Empty name
      await expect(
        apiClient.updateUserProfile({ name: '' })
      ).rejects.toThrow();

      // Very long name
      const longName = 'a'.repeat(200);
      await expect(
        apiClient.updateUserProfile({ name: longName })
      ).rejects.toThrow();
    });

    it('should preserve existing data when updating single field', async () => {
      const currentProfile = await apiClient.getUserProfile();
      
      // Update only one field
      await apiClient.updateUserProfile({ name: `Updated ${Date.now()}` });
      
      const updatedProfile = await apiClient.getUserProfile();
      
      // Other fields should remain unchanged
      expect(updatedProfile.email).toBe(currentProfile.email);
      expect(updatedProfile.role).toBe(currentProfile.role);
      
      if (currentProfile.phone) {
        expect(updatedProfile.phone).toBe(currentProfile.phone);
      }
    });
  });
});