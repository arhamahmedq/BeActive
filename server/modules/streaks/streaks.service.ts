import { StreakStatus, UserActivityState } from '@prisma/client'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import { applyStreakTransition } from '../../core/state-machines/streak.machine'
import {
  getStreakByUserId,
  updateStreak,
  persistStreakEvent,
  getPostCreatedAt,
} from './streaks.repo'
import { setActivityState } from '../users/users.service'
import type { StreakResponse, PublicStreakResponse } from './streaks.types'

function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export async function onWorkoutVerified(params: {
  postId: string
  userId: string
}): Promise<void> {
  const { postId, userId } = params

  const postCreatedAt = await getPostCreatedAt(postId)
  if (!postCreatedAt) {
    logger.error('streaks.service: post not found for streak update', { postId })
    return
  }

  const streak = await getStreakByUserId(userId)
  if (!streak) {
    logger.error('streaks.service: streak record not found', { userId })
    return
  }

  // Idempotency: skip if this post is older than or equal to the last credited post
  if (streak.lastVerifiedAt && postCreatedAt <= streak.lastVerifiedAt) {
    logger.info('streaks.service: post already credited, skipping', { postId, userId })
    return
  }

  // Same UTC day guard: only one streak increment per calendar day
  if (streak.lastVerifiedAt && isSameUTCDay(postCreatedAt, streak.lastVerifiedAt)) {
    logger.info('streaks.service: already credited today, skipping', { userId })
    return
  }

  const previousStatus = streak.status
  const newState = applyStreakTransition(
    { current: streak.current, best: streak.best, status: streak.status },
    StreakStatus.ACTIVE
  )

  await updateStreak(userId, {
    current: newState.current,
    best: newState.best,
    status: StreakStatus.ACTIVE,
    lastVerifiedAt: postCreatedAt,
    brokenAt: null,
  })

  await setActivityState(userId, UserActivityState.ACTIVE)

  const eventType =
    previousStatus === StreakStatus.BROKEN
      ? EventType.STREAK_RECOVERED
      : EventType.STREAK_UPDATED

  await persistStreakEvent({
    type: eventType,
    userId,
    payload: {
      current: newState.current,
      best: newState.best,
      status: StreakStatus.ACTIVE,
    },
    source: 'streaks.service',
  })

  logger.info('streaks.service: streak updated', {
    userId,
    current: newState.current,
    previousStatus,
    eventType,
  })
}

export async function getMyStreak(userId: string): Promise<StreakResponse | null> {
  const streak = await getStreakByUserId(userId)
  if (!streak) return null
  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
    lastVerifiedAt: streak.lastVerifiedAt?.toISOString() ?? null,
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
