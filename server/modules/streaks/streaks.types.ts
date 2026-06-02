import type { StreakStatus } from '@prisma/client'
import type { DisplayTier } from './recomputeStreak'

export interface StreakState {
  id: string
  userId: string
  current: number
  best: number
  status: StreakStatus
  lastVerifiedDate: string | null
  brokenAt: Date | null
}

// Returned by GET /api/streaks/me — v2 shape
export interface StreakResponse {
  current: number
  best: number
  status: StreakStatus
  lastVerifiedDate: string | null  // YYYY-MM-DD in user's tz
  completedToday: boolean
  displayTier: DisplayTier
}

// Returned by GET /api/streaks/:userId (less data)
export interface PublicStreakResponse {
  current: number
  best: number
  status: StreakStatus
}
