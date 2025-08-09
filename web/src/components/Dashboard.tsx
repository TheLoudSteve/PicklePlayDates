'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth'
import { apiClient, Game } from '@/lib/api'
import { CreateGameModal } from './CreateGameModal'
import { ModifyGameModal } from './ModifyGameModal'
import { ViewGameDetailsModal } from './ViewGameDetailsModal'
import { UserProfileModal } from './UserProfileModal'
import CreateCourtModal from './CreateCourtModal'
import { AdminCourtManagement } from './AdminCourtManagement'
import { LoadingSpinner } from './LoadingSpinner'

export function Dashboard() {
  const { user, signOut, needsProfileCompletion, setNeedsProfileCompletion } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'available' | 'my-games' | 'past-games'>('available')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [isViewDetailsModalOpen, setIsViewDetailsModalOpen] = useState(false)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false)
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)

  // Get current user ID
  const getCurrentUserId = (): string | null => {
    if (!user) return null
    // The user ID should be available as user.userId or in user.username for Cognito
    return user.userId || user.username || null
  }

  // Determine user's relationship to a game
  const getUserGameRelationship = (game: Game): 'owner' | 'member' | 'none' => {
    const userId = getCurrentUserId()
    if (!userId) return 'none'
    
    // Check if user is the organizer/owner
    if (game.organizerId === userId) return 'owner'
    
    // Check if user is a member (in the players list)
    if (game.players?.some(player => player.userId === userId)) return 'member'
    
    return 'none'
  }

  useEffect(() => {
    loadGames()
  }, [activeTab])

  useEffect(() => {
    if (user) {
      loadUserProfile()
    }
  }, [user])

  const loadUserProfile = async () => {
    try {
      const profile = await apiClient.getCurrentUserProfile()
      setUserProfile(profile)
    } catch (error) {
      console.error('Failed to load user profile:', error)
    }
  }

  const loadGames = async () => {
    try {
      setIsLoading(true)
      let data
      if (activeTab === 'available') {
        data = await apiClient.getAvailableGames()
      } else if (activeTab === 'my-games') {
        data = await apiClient.getUserSchedule('upcoming')
      } else {
        data = await apiClient.getUserSchedule('past')
      }
      setGames(data.games)
    } catch (error) {
      console.error('Error loading games:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinGame = async (gameId: string) => {
    try {
      await apiClient.joinGame(gameId)
      loadGames() // Reload games to update the list
    } catch (error) {
      console.error('Error joining game:', error)
      alert('Failed to join game. Please try again.')
    }
  }

  const handleLeaveGame = async (gameId: string) => {
    try {
      await apiClient.leaveGame(gameId)
      loadGames() // Reload games to update the list
    } catch (error) {
      console.error('Error leaving game:', error)
      alert('Failed to leave game. Please try again.')
    }
  }

  const handleOpenModifyModal = (game: Game) => {
    setSelectedGame(game)
    setIsModifyModalOpen(true)
  }

  const handleCloseModifyModal = () => {
    setIsModifyModalOpen(false)
    setSelectedGame(null)
  }

  const handleOpenViewDetailsModal = (gameId: string) => {
    setSelectedGameId(gameId)
    setIsViewDetailsModalOpen(true)
  }

  const handleCloseViewDetailsModal = () => {
    setIsViewDetailsModalOpen(false)
    setSelectedGameId(null)
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
                onClick={() => setIsCourtModalOpen(true)}
                className="btn btn-secondary text-sm"
              >
                Submit Court
              </button>
              {userProfile?.role === 'admin' && (
                <button
                  onClick={() => setIsAdminModalOpen(true)}
                  className="btn btn-primary text-sm bg-red-600 hover:bg-red-700 text-white"
                >
                  Admin
                </button>
              )}
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="btn btn-secondary text-sm"
              >
                Profile
              </button>
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
              onChange={(e) => setActiveTab(e.target.value as 'available' | 'my-games' | 'past-games')}
              className="block w-full rounded-md border-gray-300 focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="available">Upcoming Games</option>
              <option value="my-games">My Games</option>
              <option value="past-games">My Past Games</option>
            </select>
          </div>
          <div className="hidden sm:block">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('available')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'available'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Upcoming Games
                </button>
                <button
                  onClick={() => setActiveTab('my-games')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'my-games'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  My Games
                </button>
                <button
                  onClick={() => setActiveTab('past-games')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'past-games'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  My Past Games
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
              No {activeTab === 'available' ? 'upcoming' : activeTab === 'my-games' ? 'current' : 'past'} games
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {activeTab === 'available' 
                ? 'No games available to join. Create a new game to get started.' 
                : activeTab === 'my-games'
                ? 'You haven\'t joined any games yet.'
                : 'No games played yet.'}
            </p>
            {(activeTab === 'available' || activeTab === 'my-games') && (
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
              const relationship = getUserGameRelationship(game)
              
              return (
                <div key={game.gameId} className="card p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-medium text-gray-900">
                          {game.courtName}
                        </h3>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(game.status)}`}>
                          {game.status}
                        </span>
                        {relationship === 'owner' && (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full text-purple-600 bg-purple-100">
                            Organizer
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                        <span>📅 {date}</span>
                        <span>🕐 {time}</span>
                        <span>👥 {game.currentPlayers}/{game.maxPlayers} players</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {activeTab === 'available' && (
                        <>
                          {relationship === 'none' && (
                            <button 
                              onClick={() => handleJoinGame(game.gameId)}
                              className="btn btn-primary text-sm"
                              disabled={game.currentPlayers >= game.maxPlayers}
                            >
                              {game.currentPlayers >= game.maxPlayers ? 'Full' : 'Join Game'}
                            </button>
                          )}
                          {relationship === 'member' && (
                            <button 
                              onClick={() => handleLeaveGame(game.gameId)}
                              className="btn btn-secondary text-sm"
                            >
                              Leave Game
                            </button>
                          )}
                          {relationship === 'owner' && (
                            <button 
                              onClick={() => handleOpenModifyModal(game)}
                              className="btn btn-primary text-sm"
                            >
                              Modify Game
                            </button>
                          )}
                        </>
                      )}
                      {activeTab === 'my-games' && (
                        <>
                          {relationship === 'member' && (
                            <button 
                              onClick={() => handleLeaveGame(game.gameId)}
                              className="btn btn-secondary text-sm"
                            >
                              Leave Game
                            </button>
                          )}
                          {relationship === 'owner' && (
                            <button 
                              onClick={() => handleOpenModifyModal(game)}
                              className="btn btn-primary text-sm"
                            >
                              Modify Game
                            </button>
                          )}
                        </>
                      )}
                      <button 
                        onClick={() => handleOpenViewDetailsModal(game.gameId)}
                        className="btn btn-secondary text-sm"
                      >
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

      {/* Modify Game Modal */}
      <ModifyGameModal
        isOpen={isModifyModalOpen}
        onClose={handleCloseModifyModal}
        game={selectedGame}
        onGameModified={loadGames}
      />

      {/* View Game Details Modal */}
      <ViewGameDetailsModal
        isOpen={isViewDetailsModalOpen}
        onClose={handleCloseViewDetailsModal}
        gameId={selectedGameId}
      />

              {/* User Profile Modal */}
        <UserProfileModal
          isOpen={isProfileModalOpen || needsProfileCompletion}
          onClose={() => {
            setIsProfileModalOpen(false)
            if (needsProfileCompletion) {
              setNeedsProfileCompletion(false)
            }
          }}
          onProfileUpdated={() => {
            loadGames()
            setNeedsProfileCompletion(false)
          }}
          isInitialSetup={needsProfileCompletion}
        />

        {/* Create Court Modal */}
        <CreateCourtModal
          isOpen={isCourtModalOpen}
          onClose={() => setIsCourtModalOpen(false)}
          onCourtCreated={() => {
            setIsCourtModalOpen(false)
            // Court was submitted for approval
          }}
        />

        {/* Admin Court Management Modal */}
        {userProfile?.role === 'admin' && (
          <AdminCourtManagement
            isOpen={isAdminModalOpen}
            onClose={() => setIsAdminModalOpen(false)}
          />
        )}
      </div>
    )
  } 