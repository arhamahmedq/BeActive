import { Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
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

/**
 * THE single streak-mutation function. Reads its inputs and writes the
 * completion + projection through the supplied query runner `db`.
 *
 * In production `db` is the SHARED transaction client opened by the AI worker,
 * so the post-verification, the DailyCompletion insert, and the Streak update
 * all commit or roll back together — there is no longer any "best-effort"
 * window where a VERIFIED post can exist with no streak credit.
 *
 * Failure policy: a missing prerequisite (post / user / streak) THROWS rather
 * than returning quietly. Inside the worker's transaction that throw rolls the
 * whole unit back (post stays PENDING) — no partial state, no silent failure.
 *
 * `_now` is injectable so tests can fix the clock without mocking Date globally.
 */
export async function onWorkoutVerified(
  params: { postId: string; userId: string },
  _now?: Date,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const now = _now ?? new Date()
  const { postId, userId } = params

  const [postCreatedAt, userTimezone, streak] = await Promise.all([
    getPostCreatedAt(postId, db),
    getUserTimezone(userId, db),
    getStreakByUserId(userId, db),
  ])

  if (!postCreatedAt) {
    throw new Error(`streaks.service: post not found for streak update (postId=${postId})`)
  }
  if (!userTimezone) {
    throw new Error(`streaks.service: user not found for streak update (userId=${userId})`)
  }
  if (!streak) {
    throw new Error(`streaks.service: streak record not found (userId=${userId})`)
  }

  const localDate = toLocalDateStr(postCreatedAt, userTimezone)

  // Monotonic gate. A verified workout may only ADVANCE the streak to a strictly
  // later local day. If localDate <= lastVerifiedDate the day is either already
  // credited (==) or the user moved their clock/timezone backward (<). In both
  // cases the streak must NOT change — but the post is still a legitimate
  // verified workout, so we return WITHOUT throwing and the surrounding
  // transaction still commits markPostVerified. The DailyCompletion
  // UNIQUE(userId, localDate) constraint remains the final backstop against a
  // concurrent double-credit (a P2002 there rolls the whole transaction back).
  if (streak.lastVerifiedDate !== null && localDate <= streak.lastVerifiedDate) {
    logger.info('streaks.service: workout does not advance the local day — streak unchanged', {
      userId,
      localDate,
      lastVerifiedDate: streak.lastVerifiedDate,
    })
    return
  }

  await createDailyCompletion({ userId, localDate, postId, timezone: userTimezone }, db)

  const completions = await getCompletionsForUser(userId, db)
  const computed = recomputeStreak(completions, userTimezone, now)

  await updateStreak(
    userId,
    {
      current: computed.currentStreak,
      best: computed.bestStreak,
      status: computed.status,
      lastVerifiedDate: computed.lastVerifiedDate,
      brokenAt: null,
    },
    db
  )

  // Classify the event from the ACTUAL recomputed transition — never from the
  // stored streak.status. In v2, BROKEN is applied asynchronously by the hourly
  // cron, so a workout that lands after a missed day but before the cron runs
  // still sees status === ACTIVE. Keying the event off that stale status emitted
  // STREAK_UPDATED for what was really a lapse-and-restart (the count visibly
  // reset to 1 while the event claimed a continuation — the production defect).
  //
  // The recomputed projection is the source of truth: currentStreak === 1 with a
  // pre-existing ledger (lastVerifiedDate set) can only mean the run restarted
  // after a gap. A fresh start (no prior completions) or a consecutive-day
  // continuation (currentStreak > 1) is an ordinary update. Cron-independent.
  const isRestartAfterLapse =
    computed.currentStreak === 1 && streak.lastVerifiedDate !== null
  const eventType = isRestartAfterLapse
    ? EventType.STREAK_RECOVERED
    : EventType.STREAK_UPDATED

  await persistStreakEvent(
    {
      type: eventType,
      userId,
      payload: {
        current: computed.currentStreak,
        best: computed.bestStreak,
        status: computed.status,
      },
      source: 'streaks.service',
    },
    db
  )

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
