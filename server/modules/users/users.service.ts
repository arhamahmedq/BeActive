import { NotFoundError, RateLimitError } from '../../core/errors/AppError'
import { getUserById, updateUserProfile, getTimezoneThrottleState } from './users.repo'
import type { UserProfile, UpdateProfileInput } from './users.types'

// Anti-cheat: the streak's "today" is derived from the user's timezone, so an
// unthrottled timezone field is a streak-inflation lever (move the clock forward
// to manufacture a new local day). Cap real changes to N per rolling 24h window.
const TZ_MAX_CHANGES_PER_24H = 3
const TZ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function getProfile(userId: string): Promise<UserProfile> {
  const user = await getUserById(userId)
  if (!user) throw new NotFoundError('User')
  return user
}

// _now is injectable so the throttle window can be tested without mocking Date.
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  _now: Date = new Date()
): Promise<UserProfile> {
  const existing = await getUserById(userId)
  if (!existing) throw new NotFoundError('User')

  // Throttle only a genuine change to a new timezone value (re-submitting the
  // same timezone, or updating only displayName/bio, never counts).
  const isRealTzChange = input.timezone !== undefined && input.timezone !== existing.timezone
  if (!isRealTzChange) {
    return updateUserProfile(userId, input)
  }

  const throttle = (await getTimezoneThrottleState(userId)) ?? { tzChangedAt: null, tzChangeCount: 0 }
  const windowActive =
    throttle.tzChangedAt !== null && _now.getTime() - throttle.tzChangedAt.getTime() < TZ_WINDOW_MS
  const countInWindow = windowActive ? throttle.tzChangeCount : 0

  if (countInWindow >= TZ_MAX_CHANGES_PER_24H) {
    throw new RateLimitError()
  }

  // Keep the window anchored at its first change; reset the anchor when the
  // previous 24h window has lapsed.
  return updateUserProfile(userId, input, {
    tzChangedAt: windowActive ? throttle.tzChangedAt! : _now,
    tzChangeCount: countInWindow + 1,
  })
}
