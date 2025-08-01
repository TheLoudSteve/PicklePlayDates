'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { apiClient, Game } from '@/lib/api'
import { CreateGameModal } from './CreateGameModal'
import { LoadingSpinner } from './LoadingSpinner'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  useEffect(() => {
    loadGames()
  }, [activeTab])

  const loadGames = async () => {
    try {
      setIsLoading(true)
      const data = await apiClient.getUserSchedule(activeTab)
      setGames(data.games)
    } catch (error) {
      console.error('Error loading games:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDateTime = (dateTimeUTC: string) => {
    const date = new Date(dateTimeUTC)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-green-600 bg-green-100'
      case 'closed': return 'text-blue-600 bg-blue-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
      case 'past': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Pickle Play Dates
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user?.signInDetails?.loginId}
              </span>
              <button
                onClick={signOut}
                className="btn btn-secondary text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="mb-6">
          <div className="sm:hidden">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as 'upcoming' | 'past')}
              className="block w-full rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="upcoming">Upcoming Games</option>
              <option value="past">Past Games</option>
            </select>
          </div>
          <div className="hidden sm:block">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'upcoming'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Upcoming Games
                </button>
                <button
                  onClick={() => setActiveTab('past')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'past'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Past Games
                </button>
              </nav>
            </div>
          </div>
        </div>

        {/* Games List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              🏓
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No {activeTab} games
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {activeTab === 'upcoming' 
                ? 'Create a new game to get started.' 
                : 'No games played yet.'}
            </p>
            {activeTab === 'upcoming' && (
              <div className="mt-6">
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="btn btn-primary"
                >
                  Create New Game
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => {
              const { date, time } = formatDateTime(game.datetimeUTC)
              return (
                <div key={game.gameId} className="card p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {game.locationId}
                        </h3>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(game.status)}`}>
                          {game.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span>📅 {date}</span>
                        <span>🕐 {time}</span>
                        <span>👥 {game.currentPlayers}/{game.maxPlayers} players</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button className="btn btn-secondary text-sm">
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Create Game Modal */}
      <CreateGameModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGameCreated={loadGames}
      />
    </div>
  )
} 