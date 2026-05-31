import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

vi.mock('../../../server/modules/streaks/streaks.repo')
vi.mock('../../../server/modules/users/users.service')
vi.mock('../../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { evaluateStreaks } from '../../../server/workers/streakEvaluator'
import * as repo from '../../../server/modules/streaks/streaks.repo'
import * as usersService from '../../../server/modules/users/users.service'

const NOW = Date.now()

function makeStreak(hoursAgo: number, activityState: UserActivityState) {
  return {
    id: `streak-${hoursAgo}`,
    userId: `user-${hoursAgo}`,
    current: 5,
    status: StreakStatus.ACTIVE,
    lastVerifiedAt: new Date(NOW - hoursAgo * 60 * 60 * 1000),
    user: { activityState },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.markStreakBroken).mockResolvedValue(undefined)
  vi.mocked(usersService.setActivityState).mockResolvedValue(undefined)
  vi.mocked(repo.persistStreakEvent).mockResolvedValue(undefined)
})

describe('evaluateStreaks', () => {
  it('does nothing for healthy streaks (< 20h since last workout)', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(10, UserActivityState.ACTIVE),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
    expect(usersService.setActivityState).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('marks user AT_RISK at 20h when activityState is ACTIVE', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(21, UserActivityState.ACTIVE),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 1, broken: 0 })
    expect(usersService.setActivityState).toHaveBeenCalledWith(`user-21`, UserActivityState.AT_RISK)
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_AT_RISK', userId: `user-21` })
    )
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
  })

  it('does NOT re-emit AT_RISK when user already AT_RISK (idempotent)', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(22, UserActivityState.AT_RISK),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(usersService.setActivityState).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('breaks streak at 24h (from ACTIVE activityState)', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(25, UserActivityState.ACTIVE),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 1 })
    expect(repo.markStreakBroken).toHaveBeenCalledWith(`user-25`, expect.any(Date))
    expect(usersService.setActivityState).toHaveBeenCalledWith(`user-25`, UserActivityState.BROKEN)
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_BROKEN', userId: `user-25` })
    )
  })

  it('breaks streak at 24h (from AT_RISK activityState)', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(25, UserActivityState.AT_RISK),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 1 })
    expect(repo.markStreakBroken).toHaveBeenCalled()
  })

  it('processes multiple users independently', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(25, UserActivityState.AT_RISK),   // → broken
      makeStreak(21, UserActivityState.ACTIVE),     // → at-risk
      makeStreak(22, UserActivityState.AT_RISK),    // → already AT_RISK, skip
      makeStreak(5, UserActivityState.ACTIVE),      // → healthy, skip
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 1, broken: 1 })
  })

  it('returns zero counts when no active streaks exist', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 0 })
  })
})
