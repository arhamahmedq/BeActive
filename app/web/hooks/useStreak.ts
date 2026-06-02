'use client'
import { useQuery } from '@tanstack/react-query'

export type DisplayTier = 'COMPLETED_TODAY' | 'PENDING_TODAY' | 'AT_RISK' | 'BROKEN' | 'INACTIVE'

export interface StreakData {
  current: number
  best: number
  status: 'INACTIVE' | 'ACTIVE' | 'BROKEN'
  lastVerifiedDate: string | null  // YYYY-MM-DD in user's tz
  completedToday: boolean
  displayTier: DisplayTier
}

export function useStreak() {
  return useQuery<StreakData | null>({
    queryKey: ['streak', 'me'],
    queryFn: async (): Promise<StreakData | null> => {
      const res = await fetch('/api/streaks/me')
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to fetch streak: ${res.status}`)
      const { streak } = (await res.json()) as { streak: StreakData }
      return streak
    },
    staleTime: 30_000,
    retry: 1,
  })
}
