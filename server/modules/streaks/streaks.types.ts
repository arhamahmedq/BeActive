import type { StreakStatus, UserActivityState } from '@prisma/client'

export interface StreakState {
  id: string
  userId: string
  current: number
  best: number
  status: StreakStatus
  lastVerifiedAt: Date | null
  brokenAt: Date | null
}

// Returned by GET /api/streaks/me
export interface StreakResponse {
  current: number
  best: number
  status: StreakStatus
  lastVerifiedAt: string | null
}

// Returned by GET /api/streaks/:userId (less data — no lastVerifiedAt)
export interface PublicStreakResponse {
  current: number
  best: number
  status: StreakStatus
}

// Used by streakEvaluator — only ACTIVE streaks with non-null lastVerifiedAt
export interface StreakWithUserActivity {
  id: string
  userId: string
  current: number
  status: StreakStatus
  lastVerifiedAt: Date
  user: {
    activityState: UserActivityState
  }
}
