// Optional: configure or set up a testing framework before each test.
// If you delete this file, remove `setupFilesAfterEnv` from `jest.config.js`

import '@testing-library/jest-dom'

// Mock window.location for tests
Object.defineProperty(window, 'location', {
  value: {
    origin: 'https://test.pickleplaydates.com'
  },
  writable: true,
})

// Mock navigator.userAgent for tests
Object.defineProperty(navigator, 'userAgent', {
  value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  configurable: true,
})