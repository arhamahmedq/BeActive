import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus } from '@prisma/client'

vi.mock('../../../server/modules/streaks/streaks.repo')
vi.mock('../../../server/modules/streaks/recomputeStreak', () => ({
  recomputeStreak: vi.fn(),
  toLocalDateStr: vi.fn().mockReturnValue('2024-01-15'),
  getLocalHour: vi.fn().mockReturnValue(10),
  EVENING_HOUR: 20,
}))
vi.mock('../../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { evaluateStreaks } from '../../../server/workers/streakEvaluator'
import * as repo from '../../../server/modules/streaks/streaks.repo'
import * as recomputeMod from '../../../server/modules/streaks/recomputeStreak'

// Fixed clock: Jan 15 10:00 UTC — 10am, pre-evening
const NOW = new Date('2024-01-15T10:00:00Z')

function makeStreak(
  lastVerifiedDate: string | null,
  tz = 'UTC',
  current = 5
) {
  return {
    id: `streak-${lastVerifiedDate}`,
    userId: `user-${lastVerifiedDate}`,
    current,
    status: StreakStatus.ACTIVE,
    lastVerifiedDate,
    user: { timezone: tz },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.markStreakBroken).mockResolvedValue(undefined)
  vi.mocked(repo.persistStreakEvent).mockResolvedValue(undefined)
  vi.mocked(repo.getCompletionsForUser).mockResolvedValue([])
  vi.mocked(repo.hasDailyCompletion).mockResolvedValue(false)
  // Default: toLocalDateStr returns 'today', localHour = 10 (pre-evening)
  vi.mocked(recomputeMod.toLocalDateStr).mockReturnValue('2024-01-15')
  vi.mocked(recomputeMod.getLocalHour).mockReturnValue(10)
  vi.mocked(recomputeMod.recomputeStreak).mockReturnValue({
    currentStreak: 5, bestStreak: 5, lastVerifiedDate: '2024-01-14', status: StreakStatus.BROKEN,
  })
})

describe('evaluateStreaks (v2 — calendar-day)', () => {
  it('does nothing when no active streaks exist', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([])

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('does nothing for a streak completed today (daysSince === 0)', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-15'),  // lastVerifiedDate === today
    ])

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
  })

  it('does nothing for streak completed yesterday before EVENING_HOUR (daysSince === 1, early)', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-14'),  // yesterday
    ])
    vi.mocked(recomputeMod.getLocalHour).mockReturnValue(10)  // 10am — pre-evening

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('emits STREAK_AT_RISK for streak completed yesterday, past EVENING_HOUR, not yet completed today', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-14'),
    ])
    vi.mocked(recomputeMod.getLocalHour).mockReturnValue(21)  // 9pm
    vi.mocked(repo.hasDailyCompletion).mockResolvedValue(false)

    const result = await evaluateStreaks(new Date('2024-01-15T21:00:00Z'))

    expect(result).toEqual({ atRisk: 1, broken: 0 })
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_AT_RISK', userId: 'user-2024-01-14' })
    )
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
  })

  it('does NOT emit AT_RISK when user has already completed today', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-14'),
    ])
    vi.mocked(recomputeMod.getLocalHour).mockReturnValue(21)
    vi.mocked(repo.hasDailyCompletion).mockResolvedValue(true)  // already completed

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('marks BROKEN when daysSince > 1 and recompute confirms BROKEN', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-13'),  // 2 days ago
    ])
    vi.mocked(recomputeMod.recomputeStreak).mockReturnValue({
      currentStreak: 5, bestStreak: 5, lastVerifiedDate: '2024-01-13', status: StreakStatus.BROKEN,
    })

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 1 })
    expect(repo.markStreakBroken).toHaveBeenCalledWith('user-2024-01-13', NOW)
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_BROKEN', userId: 'user-2024-01-13' })
    )
  })

  it('skips BROKEN when recompute says ACTIVE (race: user verified after cron fetched)', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-13'),
    ])
    // Recompute after fetching completions shows they actually verified just in time
    vi.mocked(recomputeMod.recomputeStreak).mockReturnValue({
      currentStreak: 5, bestStreak: 5, lastVerifiedDate: '2024-01-15', status: StreakStatus.ACTIVE,
    })

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
  })

  it('skips streak with no lastVerifiedDate (not yet backfilled)', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak(null),
    ])

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 0 })
    expect(repo.markStreakBroken).not.toHaveBeenCalled()
  })

  it('processes multiple users independently', async () => {
    vi.mocked(repo.getActiveStreaksV2ForEvaluation).mockResolvedValue([
      makeStreak('2024-01-13'),  // → BROKEN (daysSince 2)
      makeStreak('2024-01-15'),  // → healthy (daysSince 0)
    ])
    vi.mocked(recomputeMod.recomputeStreak).mockReturnValue({
      currentStreak: 5, bestStreak: 5, lastVerifiedDate: '2024-01-13', status: StreakStatus.BROKEN,
    })

    const result = await evaluateStreaks(NOW)

    expect(result).toEqual({ atRisk: 0, broken: 1 })
    expect(repo.markStreakBroken).toHaveBeenCalledTimes(1)
  })
})
