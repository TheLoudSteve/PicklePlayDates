'use client'

import { useState, useEffect } from 'react'
import { apiClient, Game, Player } from '@/lib/api'
import { formatDUPRRange, formatDUPRLevel, getDUPRColor, type DUPRLevel } from '@/lib/dupr'
import { formatDateTimeDetailed } from '@/lib/datetime'
import { PlayerProfileModal } from './PlayerProfileModal'

interface ViewGameDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  gameId: string | null
}

export function ViewGameDetailsModal({ isOpen, onClose, gameId }: ViewGameDetailsModalProps) {
  const [game, setGame] = useState<Game | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [isPlayerProfileModalOpen, setIsPlayerProfileModalOpen] = useState(false)

  useEffect(() => {
    if (isOpen && gameId) {
      loadGameDetails()
    }
  }, [isOpen, gameId])

  const loadGameDetails = async () => {
    if (!gameId) return
    
    try {
      setIsLoading(true)
      const gameData = await apiClient.getGame(gameId)
      setGame(gameData)
    } catch (error) {
      console.error('Error loading game details:', error)
      alert('Failed to load game details. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Use standardized datetime formatting
  const formatDateTime = formatDateTimeDetailed;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'text-green-600 bg-green-100'
      case 'closed': return 'text-blue-600 bg-blue-100'
      case 'cancelled': return 'text-red-600 bg-red-100'
      case 'past': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }



  const handlePlayerClick = (userId: string) => {
    setSelectedPlayerId(userId)
    setIsPlayerProfileModalOpen(true)
  }

  const handleClosePlayerProfile = () => {
    setIsPlayerProfileModalOpen(false)
    setSelectedPlayerId(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Game Details
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : game ? (
            <div className="space-y-6">
              {/* Game Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {game.courtName}
                    </h3>
                    <p className="text-sm text-gray-600">{game.courtAddress}</p>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(game.status)}`}>
                    {game.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">📅 Date:</span>
                    <div className="font-medium">{formatDateTime(game.datetimeUTC).date}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">🕐 Time:</span>
                    <div className="font-medium">{formatDateTime(game.datetimeUTC).time}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">👥 Players:</span>
                    <div className="font-medium">{game.currentPlayers}/{game.maxPlayers}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">📋 Player Range:</span>
                    <div className="font-medium">{game.minPlayers}-{game.maxPlayers} players</div>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-gray-500">🏆 DUPR Requirements:</span>
                    <div className="font-medium">
                      {formatDUPRRange(game.minDUPR as DUPRLevel, game.maxDUPR as DUPRLevel)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Players List */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-3">
                  Players ({game.currentPlayers})
                </h4>
                
                {game.players && game.players.length > 0 ? (
                  <div className="space-y-3">
                    {game.players.map((player, index) => (
                      <div 
                        key={player.userId} 
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => handlePlayerClick(player.userId)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                            {player.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900">{player.userName}</span>
                              {player.userId === game.organizerId && (
                                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full text-purple-600 bg-purple-100">
                                  Organizer
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              <div>Joined: {new Date(player.joinedAt).toLocaleDateString()}</div>
                              <div className="flex items-center space-x-3 mt-1">
                                {player.dupr && (
                                  <span className={`font-medium ${getDUPRColor(player.dupr as DUPRLevel)}`}>
                                    DUPR: {formatDUPRLevel(player.dupr as DUPRLevel)}
                                  </span>
                                )}
                                <span className="text-xs text-blue-600 font-medium">
                                  Click to view profile →
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-400">
                          #{index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    No players have joined this game yet.
                  </div>
                )}
              </div>

              {/* Game Notes/Description (if we add this field later) */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-3">
                  Game Information
                </h4>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <div className="font-medium">{new Date(game.createdAt).toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Last Updated:</span>
                      <div className="font-medium">{new Date(game.updatedAt).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Failed to load game details.
            </div>
          )}

          {/* Close Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Player Profile Modal */}
      <PlayerProfileModal
        isOpen={isPlayerProfileModalOpen}
        onClose={handleClosePlayerProfile}
        userId={selectedPlayerId}
      />
    </div>
  )
}