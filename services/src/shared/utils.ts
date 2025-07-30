import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { APIResponse, JWTPayload, AppError, ValidationError } from './types';

export function createResponse<T>(
  statusCode: number,
  data: T,
  message?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({
      success: statusCode < 400,
      data: statusCode < 400 ? data : undefined,
      message: message || (statusCode < 400 ? 'Success' : 'Error'),
      error: statusCode >= 400 ? data : undefined,
    }),
  };
}

export function createErrorResponse(
  statusCode: number,
  message: string,
  validationErrors?: ValidationError[]
): APIGatewayProxyResult {
  return createResponse(statusCode, { validationErrors }, message);
}

export function parseJWT(event: APIGatewayProxyEvent): JWTPayload | null {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function getUserIdFromEvent(event: APIGatewayProxyEvent): string | null {
  // For Cognito authorizer, user ID is in requestContext
  return event.requestContext?.authorizer?.claims?.sub || null;
}

export function isAdmin(jwt: JWTPayload): boolean {
  return jwt['cognito:groups']?.includes('admin') || false;
}

export function isOrganiser(jwt: JWTPayload): boolean {
  return jwt['cognito:groups']?.includes('organiser') || false;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  // E.164 format validation
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

export function validateDateTime(datetime: string): boolean {
  try {
    const date = new Date(datetime);
    return !isNaN(date.getTime()) && datetime === date.toISOString();
  } catch {
    return false;
  }
}

export function isGameJoinable(gameDateTime: string): boolean {
  const gameTime = new Date(gameDateTime);
  const now = new Date();
  const oneHourBefore = new Date(gameTime.getTime() - 60 * 60 * 1000);
  
  return now < oneHourBefore;
}

export function isGameInFuture(gameDateTime: string): boolean {
  const gameTime = new Date(gameDateTime);
  const now = new Date();
  
  return gameTime > now;
}

export function formatDateForDDB(date: Date): string {
  return date.toISOString();
}

export function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class AppError extends Error {
  statusCode: number;
  validationErrors?: ValidationError[];

  constructor(
    statusCode: number, 
    message: string, 
    validationErrors?: ValidationError[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;
    this.name = 'AppError';
  }
}

export function handleError(error: any): APIGatewayProxyResult {
  console.error('Error:', error);

  if (error instanceof AppError) {
    return createErrorResponse(
      error.statusCode,
      error.message,
      error.validationErrors
    );
  }

  // AWS SDK errors
  if (error.name === 'ConditionalCheckFailedException') {
    return createErrorResponse(409, 'Resource conflict');
  }

  if (error.name === 'ResourceNotFoundException') {
    return createErrorResponse(404, 'Resource not found');
  }

  // Default error
  return createErrorResponse(500, 'Internal server error');
} 