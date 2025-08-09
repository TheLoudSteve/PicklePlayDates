// DUPR utility functions for consistent formatting across the app

export type DUPRLevel = 'Below 3' | '3 to 3.5' | '3.5 to 4' | '4 to 4.5' | 'Above 4.5'

// All DUPR levels in order (used internally for comparisons)
export const DUPR_LEVELS: DUPRLevel[] = ['Below 3', '3 to 3.5', '3.5 to 4', '4 to 4.5', 'Above 4.5']

// Format a single DUPR level for display
export const formatDUPRLevel = (level: DUPRLevel): string => {
  switch (level) {
    case 'Below 3': return 'Beginner'
    case '3 to 3.5': return '3.0 to 3.4'
    case '3.5 to 4': return '3.5 to 3.9'
    case '4 to 4.5': return '4.0 to 4.4'
    case 'Above 4.5': return 'Above 4.5'
    default: return level
  }
}

// Format DUPR range for display (e.g., "Beginner to 4.4", "Open to all")
export const formatDUPRRange = (minDUPR?: DUPRLevel, maxDUPR?: DUPRLevel): string => {
  // If no restrictions, show "Open to all"
  if (!minDUPR && !maxDUPR) {
    return 'Open to all'
  }
  
  if (minDUPR && maxDUPR) {
    // For ranges, extract the upper bound of the max level
    let maxBound: string
    if (maxDUPR === 'Below 3') maxBound = '3.0'
    else if (maxDUPR === '3 to 3.5') maxBound = '3.4'
    else if (maxDUPR === '3.5 to 4') maxBound = '3.9'
    else if (maxDUPR === '4 to 4.5') maxBound = '4.4'
    else maxBound = 'Above 4.5'
    
    // Use proper range formatting
    if (minDUPR === 'Below 3') {
      return `Beginner to ${maxBound}`
    } else {
      const minBound = minDUPR.split(' ')[0] // Get first number
      return `${minBound} to ${maxBound}`
    }
  } else if (minDUPR) {
    return `${formatDUPRLevel(minDUPR)} or higher`
  } else if (maxDUPR) {
    return `${formatDUPRLevel(maxDUPR)} or lower`
  }
  return 'Open to all'
}

// Get DUPR color for display
export const getDUPRColor = (level?: DUPRLevel): string => {
  if (!level) return 'text-gray-500'
  switch (level) {
    case 'Below 3': return 'text-blue-600'
    case '3 to 3.5': return 'text-green-600'
    case '3.5 to 4': return 'text-yellow-600'
    case '4 to 4.5': return 'text-orange-600'
    case 'Above 4.5': return 'text-red-600'
    default: return 'text-gray-500'
  }
}
