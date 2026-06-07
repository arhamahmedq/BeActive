'use client'
import { useQuery } from '@tanstack/react-query'

export type DisplayTier = 'COMPLETED_TODAY' | 'PENDING_TODAY' | 'AT_RISK' | 'BROKEN' | 'INACTIVE'

export interface StreakData {
  current: number
  best: number
  status: 'INACTIVE' | 'ACTIVE' | 'BROKEN'
  lastVerifiedDate: string | null  // YYYY-MM-DD in user's tz
  completedToday: boolean
  displayTier: DisplayTier  // always recomputed client-side at query time
  userTimezone: string       // IANA tz returned by the server
  localHour: number          // current hour in user's tz (0–23), used for AT_RISK countdown
}

// Mirrors server/modules/streaks/recomputeStreak.ts — pure, no Prisma import.
// Kept here to avoid importing a server module into a client hook.
function getLocalHour(now: Date, tz: string): number {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(now)
  const h = parseInt(raw, 10)
  return Number.isNaN(h) ? 0 : h === 24 ? 0 : h
}

function deriveDisplayTier(
  status: StreakData['status'],
  completedToday: boolean,
  localHour: number,
  eveningHour = 20,
): DisplayTier {
  if (status === 'INACTIVE') return 'INACTIVE'
  if (status === 'BROKEN') return 'BROKEN'
  if (completedToday) return 'COMPLETED_TODAY'
  return localHour >= eveningHour ? 'AT_RISK' : 'PENDING_TODAY'
}

export function useStreak() {
  return useQuery<StreakData | null>({
    queryKey: ['streak', 'me'],
    queryFn: async (): Promise<StreakData | null> => {
      const res = await fetch('/api/streaks/me')
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to fetch streak: ${res.status}`)
      const { streak } = (await res.json()) as {
        streak: Omit<StreakData, 'displayTier'> & { displayTier?: DisplayTier; userTimezone?: string }
      }
      // Recompute displayTier client-side using the current wall-clock time and
      // the user's actual timezone. This ensures the AT_RISK boundary (8 PM
      // local) is reflected immediately rather than being baked into a cached
      // server response that could be up to staleTime seconds old.
      // Fallback chain: server-stored tz → browser detected tz → UTC.
      // Without the browser fallback, users without a stored timezone get UTC,
      // causing the local 8 PM threshold to never trigger (e.g. 11 PM EST =
      // hour 4 UTC < 20 = PENDING_TODAY forever).
      const tz =
        streak.userTimezone ??
        (typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC')
      const localHour = getLocalHour(new Date(), tz)
      const displayTier = deriveDisplayTier(streak.status, streak.completedToday, localHour)
      return { ...streak, userTimezone: tz, displayTier, localHour }
    },
    staleTime: 30_000,
    // Refetch every 60 s so the AT_RISK boundary stays accurate across a long
    // session (worst case: display is 60 s behind the real 8 PM threshold).
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}
