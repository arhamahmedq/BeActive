import { UserActivityState } from '@prisma/client'
import { logger } from '../core/logger/index'
import { EventType } from '../core/events/index'
import {
  getActiveStreaksForEvaluation,
  markStreakBroken,
  persistStreakEvent,
} from '../modules/streaks/streaks.repo'
import { setActivityState } from '../modules/users/users.service'

const AT_RISK_THRESHOLD_MS = 20 * 60 * 60 * 1000  // 20 hours
const BROKEN_THRESHOLD_MS = 24 * 60 * 60 * 1000   // 24 hours

export async function evaluateStreaks(): Promise<{ atRisk: number; broken: number }> {
  const activeStreaks = await getActiveStreaksForEvaluation()
  const now = Date.now()
  let atRisk = 0
  let broken = 0

  for (const streak of activeStreaks) {
    const elapsedMs = now - streak.lastVerifiedAt.getTime()

    if (elapsedMs >= BROKEN_THRESHOLD_MS) {
      // R6: 24h elapsed — break the streak regardless of current activityState
      const brokenAt = new Date()
      await markStreakBroken(streak.userId, brokenAt)
      await setActivityState(streak.userId, UserActivityState.BROKEN)
      await persistStreakEvent({
        type: EventType.STREAK_BROKEN,
        userId: streak.userId,
        payload: { finalStreak: streak.current, brokenAt: brokenAt.toISOString() },
        source: 'streak.evaluator',
      })
      logger.info('streakEvaluator: streak broken', {
        userId: streak.userId,
        current: streak.current,
        elapsedHours: Math.floor(elapsedMs / 3_600_000),
      })
      broken++

    } else if (
      elapsedMs >= AT_RISK_THRESHOLD_MS &&
      streak.user.activityState === UserActivityState.ACTIVE
    ) {
      // R5: 20h elapsed and user still ACTIVE — warn once (idempotent via activityState check)
      await setActivityState(streak.userId, UserActivityState.AT_RISK)
      await persistStreakEvent({
        type: EventType.STREAK_AT_RISK,
        userId: streak.userId,
        payload: {
          hoursSinceLastWorkout: Math.floor(elapsedMs / 3_600_000),
          currentStreak: streak.current,
        },
        source: 'streak.evaluator',
      })
      logger.info('streakEvaluator: user at risk', {
        userId: streak.userId,
        current: streak.current,
        elapsedHours: Math.floor(elapsedMs / 3_600_000),
      })
      atRisk++
    }
  }

  logger.info('streakEvaluator: evaluation complete', {
    evaluated: activeStreaks.length,
    atRisk,
    broken,
  })

  return { atRisk, broken }
}
