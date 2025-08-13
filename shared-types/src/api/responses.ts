import { ValidationError } from '../types/common';

/**
 * Standard API response wrapper
 */
export interface APIResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: ErrorDetails;
}

/**
 * Error details structure
 */
export interface ErrorDetails {
  code?: string;
  validationErrors?: ValidationError[];
  details?: Record<string, any>;
}

/**
 * Success response helper type
 */
export interface SuccessResponse<T> extends APIResponse<T> {
  success: true;
  data: T;
  error?: never;
}

/**
 * Error response helper type
 */
export interface ErrorResponse extends APIResponse<never> {
  success: false;
  data?: never;
  error: ErrorDetails;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedAPIResponse<T> extends SuccessResponse<PaginatedResponse<T>> {}

/**
 * Common HTTP status codes used in the API
 */
export enum HTTPStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
}

/**
 * API Error types
 */
export enum APIErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Type-safe API response for different endpoints
 */
export type APIEndpointResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Health check response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    database: 'healthy' | 'unhealthy';
    notifications: 'healthy' | 'unhealthy';
  };
}