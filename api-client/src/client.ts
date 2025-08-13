import {
  GameResponse,
  GameWithPlayers,
  GameSummary,
  UserProfileResponse,
  CourtResponse,
  CourtSummary,
  CreateGameRequest,
  UpdateGameRequest,
  UpdateUserProfileRequest,
  CreateCourtRequest,
  UpdateCourtRequest,
  SearchCourtsQuery,
  GetAvailableGamesQuery,
  GetUserScheduleQuery,
  APIResponse,
  SuccessResponse,
  PaginatedAPIResponse,
  UUID,
  ScheduleRange,
} from '@pickle-play-dates/shared-types';

import { APIClientConfig, DEFAULT_CONFIG, ENV_CONFIGS, Environment } from './config';
import { 
  NetworkError, 
  AuthenticationError, 
  createGenericErrorFromResponse,
  APIClientError 
} from './errors';
import { HTTPMethod, RequestConfig, Request, Response, EventHandler, APIEvent } from './types';

/**
 * Main API client class for Pickle Play Dates
 */
export class PicklePlayDatesAPI {
  private config: APIClientConfig;
  private eventHandlers: EventHandler[] = [];

  constructor(config: APIClientConfig | Environment) {
    if (typeof config === 'string') {
      this.config = { ...DEFAULT_CONFIG, ...ENV_CONFIGS[config] };
    } else {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }

  /**
   * Update the authentication token
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
    this.emit('auth_token_refreshed', { token });
  }

  /**
   * Add an event handler for monitoring API calls
   */
  on(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(handler: EventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  private emit(event: APIEvent, data: any): void {
    this.eventHandlers.forEach(handler => handler(event, data));
  }

  /**
   * Make an HTTP request with retry logic
   */
  private async request<T>(
    method: HTTPMethod,
    endpoint: string,
    body?: any,
    config?: RequestConfig
  ): Promise<T> {
    const url = `${this.config.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.config.defaultHeaders,
      ...config?.headers,
    };

    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }

    let queryString = '';
    if (config?.params) {
      const params = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      });
      queryString = params.toString();
      if (queryString) {
        queryString = `?${queryString}`;
      }
    }

    const request: Request = {
      method,
      url: `${url}${queryString}`,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout: config?.timeout || this.config.timeout || 10000,
    };

    this.emit('request_start', { method, url: request.url, headers });

    try {
      const response = await this.executeRequest<T>(request, config);
      this.emit('request_success', { method, url: request.url, status: response.status });
      return response.data;
    } catch (error) {
      this.emit('request_error', { method, url: request.url, error });
      throw error;
    }
  }

  /**
   * Execute the actual HTTP request with fetch
   */
  private async executeRequest<T>(
    request: Request,
    config?: RequestConfig
  ): Promise<Response<T>> {
    const retryConfig = config?.retryConfig || this.config.retry;
    const shouldRetry = config?.retry !== false && retryConfig;
    
    let lastError: Error | undefined;
    const maxAttempts = shouldRetry ? retryConfig!.attempts : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), request.timeout);

        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorData: any;
          
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          // Check if this status code should trigger a retry
          if (
            shouldRetry && 
            attempt < maxAttempts && 
            retryConfig!.retryableStatusCodes.includes(response.status)
          ) {
            const delay = Math.min(
              retryConfig!.baseDelay * Math.pow(2, attempt - 1),
              retryConfig!.maxDelay
            );
            
            this.emit('request_retry', { 
              attempt, 
              maxAttempts, 
              delay, 
              status: response.status 
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw createGenericErrorFromResponse(
            response.status,
            errorData.message || `HTTP ${response.status}`,
            errorData.error?.validationErrors
          );
        }

        const responseText = await response.text();
        let data: T;
        
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          throw new Error('Invalid JSON response from server');
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          data,
        };

      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors or client errors (4xx)
        if (
          error instanceof APIClientError ||
          (error as any)?.name === 'AbortError' ||
          !shouldRetry ||
          attempt >= maxAttempts
        ) {
          break;
        }

        const delay = Math.min(
          retryConfig!.baseDelay * Math.pow(2, attempt - 1),
          retryConfig!.maxDelay
        );
        
        this.emit('request_retry', { attempt, maxAttempts, delay, error });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If we get here, all retries failed
    if (lastError instanceof APIClientError) {
      throw lastError;
    }
    
    throw new NetworkError(
      lastError?.message || 'Network request failed',
      lastError
    );
  }

  // =================
  // GAME ENDPOINTS
  // =================

  /**
   * Create a new game
   */
  async createGame(gameData: CreateGameRequest, config?: RequestConfig): Promise<GameResponse> {
    const response = await this.request<SuccessResponse<GameResponse>>(
      'POST',
      '/games',
      gameData,
      config
    );
    return response.data;
  }

  /**
   * Get available games
   */
  async getAvailableGames(
    query?: GetAvailableGamesQuery,
    config?: RequestConfig
  ): Promise<GameSummary[]> {
    const response = await this.request<SuccessResponse<GameSummary[]>>(
      'GET',
      '/games',
      undefined,
      { ...config, params: query }
    );
    return response.data;
  }

  /**
   * Get a specific game by ID
   */
  async getGame(gameId: UUID, config?: RequestConfig): Promise<GameWithPlayers> {
    const response = await this.request<SuccessResponse<GameWithPlayers>>(
      'GET',
      `/games/${gameId}`,
      undefined,
      config
    );
    return response.data;
  }

  /**
   * Update a game
   */
  async updateGame(
    gameId: UUID,
    updates: UpdateGameRequest,
    config?: RequestConfig
  ): Promise<GameResponse> {
    const response = await this.request<SuccessResponse<GameResponse>>(
      'PUT',
      `/games/${gameId}`,
      updates,
      config
    );
    return response.data;
  }

  /**
   * Cancel a game
   */
  async cancelGame(gameId: UUID, config?: RequestConfig): Promise<void> {
    await this.request<SuccessResponse<void>>(
      'DELETE',
      `/games/${gameId}`,
      undefined,
      config
    );
  }

  /**
   * Join a game
   */
  async joinGame(gameId: UUID, config?: RequestConfig): Promise<void> {
    await this.request<SuccessResponse<void>>(
      'POST',
      `/games/${gameId}/join`,
      undefined,
      config
    );
  }

  /**
   * Leave a game
   */
  async leaveGame(gameId: UUID, config?: RequestConfig): Promise<void> {
    await this.request<SuccessResponse<void>>(
      'POST',
      `/games/${gameId}/leave`,
      undefined,
      config
    );
  }

  /**
   * Kick a player from a game
   */
  async kickPlayer(gameId: UUID, userId: UUID, config?: RequestConfig): Promise<void> {
    await this.request<SuccessResponse<void>>(
      'DELETE',
      `/games/${gameId}/players/${userId}`,
      undefined,
      config
    );
  }

  // =================
  // USER ENDPOINTS
  // =================

  /**
   * Get current user's profile
   */
  async getUserProfile(config?: RequestConfig): Promise<UserProfileResponse> {
    const response = await this.request<SuccessResponse<UserProfileResponse>>(
      'GET',
      '/users/me/profile',
      undefined,
      config
    );
    return response.data;
  }

  /**
   * Update current user's profile
   */
  async updateUserProfile(
    updates: UpdateUserProfileRequest,
    config?: RequestConfig
  ): Promise<UserProfileResponse> {
    const response = await this.request<SuccessResponse<UserProfileResponse>>(
      'PUT',
      '/users/me',
      updates,
      config
    );
    return response.data;
  }

  /**
   * Get user's game schedule
   */
  async getUserSchedule(
    range: ScheduleRange,
    query?: Omit<GetUserScheduleQuery, 'range'>,
    config?: RequestConfig
  ): Promise<GameSummary[]> {
    const response = await this.request<SuccessResponse<GameSummary[]>>(
      'GET',
      '/users/me/schedule',
      undefined,
      { ...config, params: { range, ...query } }
    );
    return response.data;
  }

  // =================
  // COURT ENDPOINTS
  // =================

  /**
   * Search for courts
   */
  async searchCourts(
    query?: SearchCourtsQuery,
    config?: RequestConfig
  ): Promise<CourtSummary[]> {
    const response = await this.request<SuccessResponse<CourtSummary[]>>(
      'GET',
      '/courts',
      undefined,
      { ...config, params: query }
    );
    return response.data;
  }

  /**
   * Create a new court
   */
  async createCourt(courtData: CreateCourtRequest, config?: RequestConfig): Promise<CourtResponse> {
    const response = await this.request<SuccessResponse<CourtResponse>>(
      'POST',
      '/courts',
      courtData,
      config
    );
    return response.data;
  }

  // =================
  // ADMIN ENDPOINTS
  // =================

  /**
   * Get all courts for admin management
   */
  async getAdminCourts(config?: RequestConfig): Promise<CourtResponse[]> {
    if (!this.config.authToken) {
      throw new AuthenticationError('Authentication required for admin endpoints');
    }
    
    const response = await this.request<SuccessResponse<CourtResponse[]>>(
      'GET',
      '/admin/courts',
      undefined,
      config
    );
    return response.data;
  }

  /**
   * Approve a court (admin only)
   */
  async approveCourt(courtId: UUID, config?: RequestConfig): Promise<void> {
    if (!this.config.authToken) {
      throw new AuthenticationError('Authentication required for admin endpoints');
    }
    
    await this.request<SuccessResponse<void>>(
      'POST',
      `/admin/courts/${courtId}/approve`,
      undefined,
      config
    );
  }
}