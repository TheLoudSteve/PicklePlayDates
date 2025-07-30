import {
  validateEmail,
  validatePhone,
  validateDateTime,
  isGameJoinable,
  isGameInFuture,
  generateGameId,
  AppError,
} from '../utils';

describe('Utility Functions', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should validate E.164 phone numbers', () => {
      expect(validatePhone('+1234567890')).toBe(true);
      expect(validatePhone('+447911123456')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('1234567890')).toBe(false);
      expect(validatePhone('+0123456789')).toBe(false);
      expect(validatePhone('+123')).toBe(false);
    });
  });

  describe('validateDateTime', () => {
    it('should validate ISO-8601 datetime strings', () => {
      expect(validateDateTime('2024-01-15T10:30:00.000Z')).toBe(true);
      expect(validateDateTime(new Date().toISOString())).toBe(true);
    });

    it('should reject invalid datetime strings', () => {
      expect(validateDateTime('2024-01-15')).toBe(false);
      expect(validateDateTime('invalid')).toBe(false);
      expect(validateDateTime('2024-13-01T10:30:00.000Z')).toBe(false);
    });
  });

  describe('isGameJoinable', () => {
    it('should return true for games more than 1 hour in the future', () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      expect(isGameJoinable(futureTime)).toBe(true);
    });

    it('should return false for games less than 1 hour in the future', () => {
      const nearFutureTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      expect(isGameJoinable(nearFutureTime)).toBe(false);
    });

    it('should return false for games in the past', () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(isGameJoinable(pastTime)).toBe(false);
    });
  });

  describe('isGameInFuture', () => {
    it('should return true for future dates', () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      expect(isGameInFuture(futureTime)).toBe(true);
    });

    it('should return false for past dates', () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(isGameInFuture(pastTime)).toBe(false);
    });
  });

  describe('generateGameId', () => {
    it('should generate unique game IDs', () => {
      const id1 = generateGameId();
      const id2 = generateGameId();
      
      expect(id1).toMatch(/^game_\d+_[a-z0-9]{7}$/);
      expect(id2).toMatch(/^game_\d+_[a-z0-9]{7}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('AppError', () => {
    it('should create error with status code and message', () => {
      const error = new AppError(400, 'Test error');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppError');
    });

    it('should create error with validation errors', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email' },
      ];
      const error = new AppError(422, 'Validation failed', validationErrors);
      
      expect(error.statusCode).toBe(422);
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });
}); 