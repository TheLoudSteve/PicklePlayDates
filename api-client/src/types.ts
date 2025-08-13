/**
 * HTTP method types
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request configuration for individual API calls
 */
export interface RequestConfig {
  /** Override the default timeout for this request */
  timeout?: number;
  
  /** Additional headers for this request */
  headers?: Record<string, string>;
  
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  
  /** Whether to retry this request on failure (default: true) */
  retry?: boolean;
  
  /** Custom retry configuration for this request */
  retryConfig?: {
    attempts: number;
    baseDelay: number;
    maxDelay: number;
  };
}

/**
 * Internal request object used by the HTTP client
 */
export interface Request {
  method: HTTPMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeout: number;
}

/**
 * Internal response object from the HTTP client
 */
export interface Response<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Common query parameters for list endpoints
 */
export interface ListQueryParams {
  limit?: number;
  offset?: number;
  page?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * API client event types for logging/monitoring
 */
export type APIEvent = 
  | 'request_start'
  | 'request_success' 
  | 'request_error'
  | 'request_retry'
  | 'auth_token_refreshed';

/**
 * Event handler function type
 */
export type EventHandler = (event: APIEvent, data: any) => void;