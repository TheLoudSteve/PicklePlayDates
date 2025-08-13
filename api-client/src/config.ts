/**
 * Configuration options for the API client
 */
export interface APIClientConfig {
  /** Base URL for the API (e.g., https://api.pickleplaydates.com) */
  baseURL: string;
  
  /** Authentication token (JWT from Cognito) */
  authToken?: string;
  
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Default headers to include with all requests */
  defaultHeaders?: Record<string, string>;
  
  /** Enable debug logging (default: false) */
  debug?: boolean;
  
  /** Retry configuration */
  retry?: {
    /** Number of retry attempts (default: 3) */
    attempts: number;
    /** Base delay between retries in ms (default: 1000) */
    baseDelay: number;
    /** Maximum delay between retries in ms (default: 5000) */
    maxDelay: number;
    /** HTTP status codes that should trigger a retry */
    retryableStatusCodes: number[];
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<APIClientConfig> = {
  timeout: 10000,
  debug: false,
  retry: {
    attempts: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};

/**
 * Environment-specific configuration presets
 */
export const ENV_CONFIGS = {
  development: {
    baseURL: 'https://api-dev.pickleplaydates.com',
    debug: true,
  },
  staging: {
    baseURL: 'https://api-staging.pickleplaydates.com',
    debug: false,
  },
  production: {
    baseURL: 'https://api.pickleplaydates.com',
    debug: false,
  },
} as const;

export type Environment = keyof typeof ENV_CONFIGS;