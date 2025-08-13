import { ValidationError, APIErrorType, HTTPStatusCode } from '@pickle-play-dates/shared-types';

/**
 * Base class for all API client errors
 */
export abstract class APIClientError extends Error {
  abstract readonly type: APIErrorType;
  abstract readonly statusCode: HTTPStatusCode;
  
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Network-related errors (timeouts, connection issues, etc.)
 */
export class NetworkError extends APIClientError {
  readonly type = APIErrorType.EXTERNAL_SERVICE_ERROR;
  readonly statusCode = HTTPStatusCode.INTERNAL_SERVER_ERROR;
  
  constructor(message: string, originalError?: Error) {
    super(`Network error: ${message}`, originalError);
  }
}

/**
 * Authentication errors (invalid token, expired token, etc.)
 */
export class AuthenticationError extends APIClientError {
  readonly type = APIErrorType.AUTHENTICATION_ERROR;
  readonly statusCode = HTTPStatusCode.UNAUTHORIZED;
  
  constructor(message = 'Authentication failed') {
    super(message);
  }
}

/**
 * Authorization errors (insufficient permissions)
 */
export class AuthorizationError extends APIClientError {
  readonly type = APIErrorType.AUTHORIZATION_ERROR;
  readonly statusCode = HTTPStatusCode.FORBIDDEN;
  
  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

/**
 * Validation errors (invalid request data)
 */
export class ValidationAPIError extends APIClientError {
  readonly type = APIErrorType.VALIDATION_ERROR;
  readonly statusCode = HTTPStatusCode.UNPROCESSABLE_ENTITY;
  
  constructor(
    message: string,
    public readonly validationErrors: ValidationError[] = []
  ) {
    super(message);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends APIClientError {
  readonly type = APIErrorType.NOT_FOUND_ERROR;
  readonly statusCode = HTTPStatusCode.NOT_FOUND;
  
  constructor(resource: string) {
    super(`${resource} not found`);
  }
}

/**
 * Conflict errors (resource already exists, conflicting state, etc.)
 */
export class ConflictError extends APIClientError {
  readonly type = APIErrorType.CONFLICT_ERROR;
  readonly statusCode = HTTPStatusCode.CONFLICT;
  
  constructor(message: string) {
    super(message);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends APIClientError {
  readonly type = APIErrorType.RATE_LIMIT_ERROR;
  readonly statusCode = HTTPStatusCode.INTERNAL_SERVER_ERROR; // 429 would be better but not in enum
  
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfter?: number
  ) {
    super(message);
  }
}

/**
 * Server errors (5xx responses)
 */
export class ServerError extends APIClientError {
  readonly type = APIErrorType.INTERNAL_ERROR;
  
  constructor(
    message: string,
    public readonly statusCode: HTTPStatusCode = HTTPStatusCode.INTERNAL_SERVER_ERROR
  ) {
    super(message);
  }
}

// Create a generic APIClientError class for cases not covered by specific error types
class GenericAPIClientError extends APIClientError {
  readonly type = APIErrorType.INTERNAL_ERROR;
  readonly statusCode = HTTPStatusCode.INTERNAL_SERVER_ERROR;
}

/**
 * Factory function to create appropriate error based on HTTP status code
 */
export function createGenericErrorFromResponse(
  statusCode: number,
  message: string,
  validationErrors?: ValidationError[]
): APIClientError {
  switch (statusCode) {
    case 400:
      return validationErrors 
        ? new ValidationAPIError(message, validationErrors)
        : new GenericAPIClientError(message);
    case 401:
      return new AuthenticationError(message);
    case 403:
      return new AuthorizationError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 422:
      return new ValidationAPIError(message, validationErrors);
    case 429:
      return new RateLimitError(message);
    default:
      if (statusCode >= 500) {
        return new ServerError(message, statusCode as HTTPStatusCode);
      }
      return new GenericAPIClientError(message);
  }
}