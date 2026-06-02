import { StreakStatus } from '@prisma/client'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import {
  getStreakByUserId,
  updateStreak,
  persistStreakEvent,
  getPostCreatedAt,
  getUserTimezone,
  createDailyCompletion,
  getCompletionsForUser,
  hasDailyCompletion,
} from './streaks.repo'
import { recomputeStreak, toLocalDateStr, getLocalHour, deriveDisplayTier } from './recomputeStreak'
import type { StreakResponse, PublicStreakResponse } from './streaks.types'

// _now is injectable so tests can fix the clock without mocking Date globally.
export async function onWorkoutVerified(
  params: { postId: string; userId: string },
  _now?: Date
): Promise<void> {
  const now = _now ?? new Date()
  const { postId, userId } = params

  const [postCreatedAt, userTimezone, streak] = await Promise.all([
    getPostCreatedAt(postId),
    getUserTimezone(userId),
    getStreakByUserId(userId),
  ])

  if (!postCreatedAt) {
    logger.error('streaks.service: post not found for streak update', { postId })
    return
  }
  if (!userTimezone) {
    logger.error('streaks.service: user not found for streak update', { userId })
    return
  }
  if (!streak) {
    logger.error('streaks.service: streak record not found', { userId })
    return
  }

  const localDate = toLocalDateStr(postCreatedAt, userTimezone)

  // DB UNIQUE(userId, localDate) is the idempotency gate: one completion per local calendar day.
  const inserted = await createDailyCompletion({ userId, localDate, postId, timezone: userTimezone })
  if (!inserted) {
    logger.info('streaks.service: already credited for this local date', { userId, localDate })
    return
  }

  const completions = await getCompletionsForUser(userId)
  const computed = recomputeStreak(completions, userTimezone, now)

  await updateStreak(userId, {
    current: computed.currentStreak,
    best: computed.bestStreak,
    status: computed.status,
    lastVerifiedDate: computed.lastVerifiedDate,
    brokenAt: null,
  })

  const eventType =
    streak.status === StreakStatus.BROKEN
      ? EventType.STREAK_RECOVERED
      : EventType.STREAK_UPDATED

  await persistStreakEvent({
    type: eventType,
    userId,
    payload: {
      current: computed.currentStreak,
      best: computed.bestStreak,
      status: computed.status,
    },
    source: 'streaks.service',
  })

  logger.info('streaks.service: streak updated', {
    userId,
    current: computed.currentStreak,
    previousStatus: streak.status,
    eventType,
  })
}

export async function getMyStreak(userId: string, _now?: Date): Promise<StreakResponse | null> {
  const now = _now ?? new Date()

  const [streak, tz] = await Promise.all([
    getStreakByUserId(userId),
    getUserTimezone(userId),
  ])
  if (!streak) return null

  const userTz = tz ?? 'UTC'
  const localToday = toLocalDateStr(now, userTz)
  const localHour = getLocalHour(now, userTz)
  const completedToday = await hasDailyCompletion(userId, localToday)
  const displayTier = deriveDisplayTier(streak.status, completedToday, localHour)

  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
    lastVerifiedDate: streak.lastVerifiedDate,
    completedToday,
    displayTier,
  }
}

export async function getPublicStreak(userId: string): Promise<PublicStreakResponse | null> {
  const streak = await getStreakByUserId(userId)
  if (!streak) return null
  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
  }
}
