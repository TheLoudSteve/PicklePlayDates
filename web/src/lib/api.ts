'use client'

import { fetchAuthSession } from 'aws-amplify/auth'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL!

export interface Game {
  gameId: string
  organizerId: string
  datetimeUTC: string
  courtId: string
  courtName: string
  courtAddress: string
  latitude?: number
  longitude?: number
  minPlayers: number
  maxPlayers: number
  currentPlayers: number
  status: 'scheduled' | 'closed' | 'cancelled' | 'past'
  createdAt: string
  updatedAt: string
  players?: Player[]
}

export interface Player {
  userId: string
  userName: string
  joinedAt: string
  dupr?: string
}

export interface UserProfile {
  userId: string
  email: string
  name: string
  phone?: string
  dupr?: 'Below 3' | '3 to 3.5' | '3.5 to 4' | '4 to 4.5' | 'Above 4.5'
  role: 'user' | 'admin'
  createdAt: string
  updatedAt: string
}

export interface Court {
  courtId: string
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  latitude: number
  longitude: number
  courtType: 'indoor' | 'outdoor' | 'both'
  numberOfCourts: number
  isReservable: boolean
  reservationInfo?: string
  hoursOfOperation?: string
  amenities?: string[]
  fees?: string
  website?: string
  phone?: string
  description?: string
  submittedBy: string
  submittedByName: string
  approvedBy?: string
  isApproved: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateCourtRequest {
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  courtType: 'indoor' | 'outdoor' | 'both'
  numberOfCourts: number
  isReservable: boolean
  reservationInfo?: string
  hoursOfOperation?: string
  amenities?: string[]
  fees?: string
  website?: string
  phone?: string
  description?: string
}

export interface CreateGameRequest {
  datetimeUTC: string
  courtId: string
  minPlayers?: number
  maxPlayers?: number
}

export interface UpdateUserProfileRequest {
  name?: string
  phone?: string
  dupr?: 'Below 3' | '3 to 3.5' | '3.5 to 4' | '4 to 4.5' | 'Above 4.5'
}

class ApiClient {
  private async getAuthToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString() || null
      console.log('🔐 Auth token retrieved:', token ? 'YES (length: ' + token.length + ')' : 'NO')
      return token
    } catch (error) {
      console.error('❌ Error getting auth token:', error)
      return null
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getAuthToken()
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (token) {
      (headers as any).Authorization = `Bearer ${token}`
    }

    const url = `${API_BASE_URL}${endpoint}`
    console.log('🌐 Making API request:', options.method || 'GET', url)
    console.log('🔑 Auth header present:', !!token)

    const response = await fetch(url, {
      ...options,
      headers,
    })

    console.log('📡 API response:', response.status, response.statusText)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ API error:', response.status, errorData)
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return data.data
  }

  // Game endpoints
  async createGame(game: CreateGameRequest): Promise<Game> {
    return this.request<Game>('/games', {
      method: 'POST',
      body: JSON.stringify(game),
    })
  }

  async getGame(gameId: string): Promise<Game> {
    return this.request<Game>(`/games/${gameId}`)
  }

  async joinGame(gameId: string): Promise<void> {
    return this.request<void>(`/games/${gameId}/join`, {
      method: 'POST',
    })
  }

  async leaveGame(gameId: string): Promise<void> {
    return this.request<void>(`/games/${gameId}/leave`, {
      method: 'POST',
    })
  }

  async updateGame(gameId: string, updates: Partial<CreateGameRequest>): Promise<Game> {
    return this.request<Game>(`/games/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async cancelGame(gameId: string): Promise<void> {
    return this.request<void>(`/games/${gameId}`, {
      method: 'DELETE',
    })
  }

  async kickPlayer(gameId: string, userId: string): Promise<void> {
    return this.request<void>(`/games/${gameId}/players/${userId}`, {
      method: 'DELETE',
    })
  }

  // Game listing endpoints
  async getAvailableGames(): Promise<{ games: Game[], count: number }> {
    return this.request<{ games: Game[], count: number }>(`/games`)
  }

  // User endpoints  
  async getUserSchedule(range: 'upcoming' | 'past'): Promise<{ games: Game[], count: number }> {
    return this.request<{ games: Game[], count: number }>(`/users/me/schedule?range=${range}`)
  }

  async getCurrentUserProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('/users/me')
  }

  // Court API methods
  async createCourt(court: CreateCourtRequest): Promise<Court> {
    return this.request<Court>('/courts', {
      method: 'POST',
      body: JSON.stringify(court),
    })
  }

  async searchCourts(params?: {
    city?: string
    latitude?: number
    longitude?: number
    radius?: number
    isApproved?: boolean
  }): Promise<{ courts: Court[], count: number }> {
    const queryParams = new URLSearchParams()
    if (params?.city) queryParams.append('city', params.city)
    if (params?.latitude) queryParams.append('latitude', params.latitude.toString())
    if (params?.longitude) queryParams.append('longitude', params.longitude.toString())
    if (params?.radius) queryParams.append('radius', params.radius.toString())
    if (params?.isApproved !== undefined) queryParams.append('isApproved', params.isApproved.toString())

    const url = queryParams.toString() ? `/courts?${queryParams.toString()}` : '/courts'
    return this.request<{ courts: Court[], count: number }>(url)
  }

  // Admin court management
  async getAdminCourts(includeUnapproved?: boolean): Promise<{ courts: Court[], count: number }> {
    const queryParams = includeUnapproved ? '?includeUnapproved=true' : ''
    return this.request<{ courts: Court[], count: number }>(`/admin/courts${queryParams}`)
  }

  async approveCourtAsAdmin(courtId: string, approved: boolean): Promise<Court> {
    return this.request<Court>(`/admin/courts/${courtId}`, {
      method: 'PUT',
      body: JSON.stringify({ isApproved: approved }),
    })
  }

  async updateCourtAsAdmin(courtId: string, updates: Partial<Court>): Promise<Court> {
    return this.request<Court>(`/admin/courts/${courtId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async deleteCourtAsAdmin(courtId: string): Promise<{ courtId: string }> {
    return this.request<{ courtId: string }>(`/admin/courts/${courtId}`, {
      method: 'DELETE',
    })
  }

  async updateUserProfile(profile: UpdateUserProfileRequest): Promise<UserProfile> {
    return this.request<UserProfile>('/users/me', {
      method: 'PUT',
      body: JSON.stringify(profile),
    })
  }

  async initializeUserProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('/users/me/initialize', {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient() 