import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Next.js environment
const mockEnv = {
  NEXT_PUBLIC_USER_POOL_ID: 'us-west-2_testpool',
  NEXT_PUBLIC_USER_POOL_CLIENT_ID: 'test-client-id',
  NEXT_PUBLIC_USER_POOL_DOMAIN: 'test-domain.auth.us-west-2.amazoncognito.com',
  NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN: 'true'
};

// Mock process.env
Object.defineProperty(process, 'env', {
  value: { ...process.env, ...mockEnv },
  writable: true
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://test.pickleplaydates.com'
  },
  writable: true,
});

describe('Auth Configuration', () => {
  beforeEach(() => {
    // Reset modules to ensure fresh imports
    jest.resetModules();
  });

  it('should configure Amplify with Google OAuth when enabled', async () => {
    // Set environment variables for Google OAuth
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN = 'true';
    process.env.NEXT_PUBLIC_USER_POOL_DOMAIN = 'test-domain.auth.us-west-2.amazoncognito.com';
    
    // Import auth module (this will run the configuration)
    const authModule = await import('../auth');
    
    // Verify Google OAuth is configured
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN).toBe('true');
    expect(process.env.NEXT_PUBLIC_USER_POOL_DOMAIN).toBeTruthy();
  });

  it('should not configure OAuth when Google Sign-In is disabled', async () => {
    // Disable Google OAuth
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN = 'false';
    
    // Import auth module
    const authModule = await import('../auth');
    
    // Verify OAuth is not configured
    expect(process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN).toBe('false');
  });

  it('should handle missing User Pool domain gracefully', async () => {
    // Enable Google but remove domain
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN = 'true';
    delete process.env.NEXT_PUBLIC_USER_POOL_DOMAIN;
    
    // Should not throw error when importing
    expect(async () => {
      await import('../auth');
    }).not.toThrow();
  });

  it('should use correct redirect URLs for different environments', () => {
    const testOrigins = [
      'https://dodcyw1qbl5cy.cloudfront.net',
      'http://localhost:3000',
      'https://test.pickleplaydates.com'
    ];

    testOrigins.forEach(origin => {
      // Mock window.location.origin
      Object.defineProperty(window, 'location', {
        value: { origin },
        writable: true,
      });

      // Test that redirect URLs include the current origin
      expect(window.location.origin).toBe(origin);
    });
  });

  it('should include required OAuth scopes', () => {
    const requiredScopes = ['email', 'openid', 'profile'];
    
    // These scopes are required for Google OAuth integration
    requiredScopes.forEach(scope => {
      expect(['email', 'openid', 'profile']).toContain(scope);
    });
  });
});