import { config } from 'dotenv';
import { PicklePlayDatesAPI } from '@pickle-play-dates/api-client';

// Load environment variables
config();

// Global test configuration
export const TEST_CONFIG = {
  // API configuration
  API_URL: process.env.TEST_API_URL || 'https://api-dev.pickleplaydates.com',
  AUTH_TOKEN: process.env.TEST_AUTH_TOKEN,
  
  // Test data configuration  
  TEST_USER_EMAIL: process.env.TEST_USER_EMAIL || 'test@pickleplaydates.com',
  TEST_USER_PASSWORD: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
  
  // Test timeouts
  DEFAULT_TIMEOUT: 30000,
  LONG_TIMEOUT: 60000,
  
  // Feature flags for tests
  SKIP_DESTRUCTIVE_TESTS: process.env.SKIP_DESTRUCTIVE_TESTS === 'true',
  CLEANUP_AFTER_TESTS: process.env.CLEANUP_AFTER_TESTS !== 'false',
};

// Global API client instance
export let apiClient: PicklePlayDatesAPI;

// Setup before all tests
beforeAll(async () => {
  // Initialize API client
  apiClient = new PicklePlayDatesAPI({
    baseURL: TEST_CONFIG.API_URL,
    authToken: TEST_CONFIG.AUTH_TOKEN,
    timeout: TEST_CONFIG.DEFAULT_TIMEOUT,
    debug: true,
  });

  // Add event logging for debugging
  apiClient.on((event, data) => {
    if (process.env.DEBUG_API_CALLS) {
      console.log(`API Event: ${event}`, data);
    }
  });

  // Verify API is accessible
  try {
    await apiClient.getUserProfile();
    console.log('✅ API connection established');
  } catch (error) {
    console.error('❌ Failed to connect to API:', error);
    throw new Error('API connection failed. Check TEST_API_URL and TEST_AUTH_TOKEN');
  }
});

// Global test helpers
export const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }
  
  throw lastError!;
};

// Global test data cleanup
const testDataToCleanup: Array<{
  type: 'game' | 'court' | 'user';
  id: string;
}> = [];

export const addToCleanup = (type: 'game' | 'court' | 'user', id: string): void => {
  testDataToCleanup.push({ type, id });
};

afterAll(async () => {
  if (!TEST_CONFIG.CLEANUP_AFTER_TESTS) {
    console.log('Skipping cleanup (CLEANUP_AFTER_TESTS=false)');
    return;
  }

  console.log(`Cleaning up ${testDataToCleanup.length} test items...`);
  
  for (const item of testDataToCleanup) {
    try {
      switch (item.type) {
        case 'game':
          await apiClient.cancelGame(item.id);
          break;
        // Add other cleanup types as needed
        default:
          console.log(`Unknown cleanup type: ${item.type}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup ${item.type} ${item.id}:`, error);
    }
  }
  
  console.log('✅ Cleanup completed');
});