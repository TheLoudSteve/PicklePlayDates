'use client'

import { useState, useEffect } from 'react'
import { apiClient, Game, Player } from '@/lib/api'

interface ModifyGameModalProps {
  isOpen: boolean
  onClose: () => void
  game: Game | null
  onGameModified: () => void
}

export function ModifyGameModal({ isOpen, onClose, game, onGameModified }: ModifyGameModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'players'>('details')
  
  // Form state for game details
  const [formData, setFormData] = useState({
    datetimeUTC: '',
    locationId: '',
    minPlayers: 4,
    maxPlayers: 6
  })

  useEffect(() => {
    if (game) {
      setFormData({
        datetimeUTC: game.datetimeUTC.slice(0, 16), // Format for datetime-local input
        locationId: game.locationId,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers
      })
    }
  }, [game])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!game) return

    try {
      setIsLoading(true)
      
      // Convert back to ISO string
      const datetimeUTC = new Date(formData.datetimeUTC).toISOString()
      
      await apiClient.updateGame(game.gameId, {
        datetimeUTC,
        locationId: formData.locationId,
        minPlayers: formData.minPlayers,
        maxPlayers: formData.maxPlayers
      })
      
      onGameModified()
      onClose()
    } catch (error) {
      console.error('Error updating game:', error)
      alert('Failed to update game. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelGame = async () => {
    if (!game) return
    
    if (!confirm('Are you sure you want to cancel this game? This action cannot be undone.')) {
      return
    }

    try {
      setIsLoading(true)
      await apiClient.cancelGame(game.gameId)
      onGameModified()
      onClose()
    } catch (error) {
      console.error('Error canceling game:', error)
      alert('Failed to cancel game. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKickPlayer = async (userId: string) => {
    if (!game) return
    
    if (!confirm('Are you sure you want to remove this player from the game?')) {
      return
    }

    try {
      setIsLoading(true)
      await apiClient.kickPlayer(game.gameId, userId)
      onGameModified()
      // Refresh the modal data by refetching the game
      // For now, just close and let parent refresh
      onClose()
    } catch (error) {
      console.error('Error removing player:', error)
      alert('Failed to remove player. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !game) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Modify Game
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'details'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Game Details
                </button>
                <button
                  onClick={() => setActiveTab('players')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'players'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Players ({game.currentPlayers})
                </button>
              </nav>
            </div>
          </div>

          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="datetime" className="block text-sm font-medium text-gray-700 mb-1">
                  Date & Time
                </label>
                <input
                  type="datetime-local"
                  id="datetime"
                  value={formData.datetimeUTC}
                  onChange={(e) => setFormData({ ...formData, datetimeUTC: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  id="location"
                  value={formData.locationId}
                  onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="e.g., Central Park Courts"
                  required
                />
              </div>

              <div className="flex space-x-4">
                <div className="flex-1">
                  <label htmlFor="minPlayers" className="block text-sm font-medium text-gray-700 mb-1">
                    Min Players
                  </label>
                  <input
                    type="number"
                    id="minPlayers"
                    min="2"
                    max="12"
                    value={formData.minPlayers}
                    onChange={(e) => setFormData({ ...formData, minPlayers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-700 mb-1">
                    Max Players
                  </label>
                  <input
                    type="number"
                    id="maxPlayers"
                    min="2"
                    max="12"
                    value={formData.maxPlayers}
                    onChange={(e) => setFormData({ ...formData, maxPlayers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 btn btn-primary"
                >
                  {isLoading ? 'Updating...' : 'Update Game'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelGame}
                  disabled={isLoading}
                  className="flex-1 btn btn-danger"
                >
                  Cancel Game
                </button>
              </div>
            </form>
          )}

          {activeTab === 'players' && (
            <div className="space-y-4">
              {game.players && game.players.length > 0 ? (
                game.players.map((player) => (
                  <div key={player.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">{player.userName}</div>
                      <div className="text-sm text-gray-500">
                        Joined: {new Date(player.joinedAt).toLocaleDateString()}
                        {player.dupr && ` • DUPR: ${player.dupr}`}
                      </div>
                    </div>
                    {player.userId !== game.organizerId && (
                      <button
                        onClick={() => handleKickPlayer(player.userId)}
                        disabled={isLoading}
                        className="btn btn-danger text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No players have joined this game yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}