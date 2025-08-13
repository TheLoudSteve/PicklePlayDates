module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/src/setup.ts'],
  testTimeout: 30000, // Integration tests may take longer
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/setup.ts',
    '!src/utils/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Run tests in sequence to avoid conflicts
  maxWorkers: 1,
  // Global test configuration
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};