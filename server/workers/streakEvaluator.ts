import { StreakStatus, NotificationType } from '@prisma/client'
import { logger } from '../core/logger/index'
import { EventType } from '../core/events/index'
import {
  getActiveStreaksV2ForEvaluation,
  markStreakBroken,
  persistStreakEvent,
  getCompletionsForUser,
  hasDailyCompletion,
} from '../modules/streaks/streaks.repo'
import {
  recomputeStreak,
  toLocalDateStr,
  getLocalHour,
  EVENING_HOUR,
} from '../modules/streaks/recomputeStreak'
import { createNotification } from '../modules/notifications/notifications.service'

// YYYY-MM-DD strings are parsed as UTC midnight by JS Date, so arithmetic is safe.
function localDaysSince(laterDateStr: string, earlierDateStr: string): number {
  return Math.floor(
    (new Date(laterDateStr).getTime() - new Date(earlierDateStr).getTime()) / 86_400_000
  )
}

// _now is injectable for deterministic tests.
export async function evaluateStreaks(
  _now?: Date
): Promise<{ atRisk: number; broken: number }> {
  const now = _now ?? new Date()
  const activeStreaks = await getActiveStreaksV2ForEvaluation()
  let atRisk = 0
  let broken = 0

  for (const streak of activeStreaks) {
    const tz = streak.user.timezone || 'UTC'

    if (!streak.lastVerifiedDate) {
      // ACTIVE streak with no ledger entry — possible if Phase 3 backfill hasn't run yet.
      // Skip: will self-heal on next verify.
      continue
    }

    const localToday = toLocalDateStr(now, tz)
    const daysSince = localDaysSince(localToday, streak.lastVerifiedDate)

    if (daysSince > 1) {
      // Full local calendar day missed — recompute to confirm (guards against race conditions
      // where a verify landed between cron fetch and this point)
      const completions = await getCompletionsForUser(streak.userId)
      const v2 = recomputeStreak(completions, tz, now)

      if (v2.status !== StreakStatus.BROKEN) {
        // User verified after cron fetched the ACTIVE row — ledger now says ACTIVE, skip
        continue
      }

      await markStreakBroken(streak.userId, now)
      await persistStreakEvent({
        type: EventType.STREAK_BROKEN,
        userId: streak.userId,
        payload: {
          finalStreak: streak.current,
          lastVerifiedDate: streak.lastVerifiedDate,
        },
        source: 'streak.evaluator',
      })
      // Day-keyed so multiple cron runs on the same day don't duplicate.
      void createNotification({
        userId: streak.userId,
        type: NotificationType.STREAK_BROKEN,
        title: 'Streak lost',
        body: streak.current > 0
          ? `Your ${streak.current}-day streak is gone. Start fresh today.`
          : 'Your streak was broken. Start fresh today.',
        data: { finalStreak: streak.current },
        idempotencyKey: `streak:${streak.userId}:STREAK_BROKEN:${localToday}`,
      }).catch((e: unknown) => {
        logger.error('Failed to create STREAK_BROKEN notification', { userId: streak.userId, error: String(e) })
      })
      logger.info('streakEvaluator: streak broken', {
        userId: streak.userId,
        current: streak.current,
        lastVerifiedDate: streak.lastVerifiedDate,
        daysSince,
      })
      broken++
    } else if (daysSince === 1) {
      // Last verified yesterday — AT_RISK if past EVENING_HOUR and no completion today.
      // Note: the event can fire multiple times per evening (once per hourly cron run).
      // Notification deduplication is handled in Slice 7 via idempotency keys.
      const localHour = getLocalHour(now, tz)
      if (localHour >= EVENING_HOUR) {
        const completedToday = await hasDailyCompletion(streak.userId, localToday)
        if (!completedToday) {
          await persistStreakEvent({
            type: EventType.STREAK_AT_RISK,
            userId: streak.userId,
            payload: {
              currentStreak: streak.current,
              localDate: localToday,
              localHour,
            },
            source: 'streak.evaluator',
          })
          logger.info('streakEvaluator: user at risk', {
            userId: streak.userId,
            current: streak.current,
            localDate: localToday,
            localHour,
          })
          atRisk++
        }
      }
    }
    // daysSince === 0: completed today — nothing to do
  }

  logger.info('streakEvaluator: evaluation complete', {
    evaluated: activeStreaks.length,
    atRisk,
    broken,
  })

  return { atRisk, broken }
}
