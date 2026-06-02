import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus } from '@prisma/client'

vi.mock('../../../server/modules/streaks/streaks.repo')
// Mock the pure engine so service tests verify wiring only — computation is tested in recomputeStreak.test.ts
vi.mock('../../../server/modules/streaks/recomputeStreak', () => ({
  recomputeStreak: vi.fn(),
  toLocalDateStr: vi.fn().mockReturnValue('2024-01-15'),
  getLocalHour: vi.fn().mockReturnValue(10),
  deriveDisplayTier: vi.fn().mockReturnValue('PENDING_TODAY'),
}))
vi.mock('../../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { onWorkoutVerified, getMyStreak, getPublicStreak } from '../../../server/modules/streaks/streaks.service'
import * as repo from '../../../server/modules/streaks/streaks.repo'
import * as recomputeMod from '../../../server/modules/streaks/recomputeStreak'
import type { DisplayTier } from '../../../server/modules/streaks/recomputeStreak'

const NOW = new Date('2024-01-15T10:00:00Z')
const YESTERDAY = new Date('2024-01-14T10:00:00Z')

const INACTIVE_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 0, best: 0,
  status: StreakStatus.INACTIVE, lastVerifiedDate: null, brokenAt: null,
}
const ACTIVE_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 5, best: 10,
  status: StreakStatus.ACTIVE, lastVerifiedDate: '2024-01-14', brokenAt: null,
}
const BROKEN_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 3, best: 7,
  status: StreakStatus.BROKEN,
  lastVerifiedDate: '2024-01-13',
  brokenAt: new Date('2024-01-14T10:00:00Z'),
}

// Canonical recompute return values per test scenario
const V2_FIRST   = { currentStreak: 1, bestStreak: 1, lastVerifiedDate: '2024-01-15', status: StreakStatus.ACTIVE }
const V2_CONT    = { currentStreak: 6, bestStreak: 10, lastVerifiedDate: '2024-01-15', status: StreakStatus.ACTIVE }
const V2_RECOVER = { currentStreak: 1, bestStreak: 7,  lastVerifiedDate: '2024-01-15', status: StreakStatus.ACTIVE }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.updateStreak).mockResolvedValue(undefined)
  vi.mocked(repo.createDailyCompletion).mockResolvedValue(undefined)
  vi.mocked(repo.getCompletionsForUser).mockResolvedValue([{ localDate: '2024-01-15' }])
  vi.mocked(repo.getUserTimezone).mockResolvedValue('UTC')
  vi.mocked(repo.hasDailyCompletion).mockResolvedValue(false)
  vi.mocked(repo.persistStreakEvent).mockResolvedValue(undefined)
  vi.mocked(recomputeMod.recomputeStreak).mockReturnValue(V2_FIRST)
  vi.mocked(recomputeMod.toLocalDateStr).mockReturnValue('2024-01-15')
  vi.mocked(recomputeMod.getLocalHour).mockReturnValue(10)
  vi.mocked(recomputeMod.deriveDisplayTier).mockReturnValue('PENDING_TODAY')
})

describe('onWorkoutVerified', () => {
  it('starts streak at 1 for new user (INACTIVE → ACTIVE)', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' }, NOW)

    expect(repo.createDailyCompletion).toHaveBeenCalledWith(
      { userId: 'user-1', localDate: '2024-01-15', postId: 'post-1', timezone: 'UTC' },
      expect.anything()
    )
    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 1,
      best: 1,
      status: StreakStatus.ACTIVE,
      lastVerifiedDate: '2024-01-15',
      brokenAt: null,
    }), expect.anything())
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_UPDATED', userId: 'user-1' }),
      expect.anything()
    )
  })

  it('increments streak for active user (ACTIVE → ACTIVE)', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)
    vi.mocked(recomputeMod.recomputeStreak).mockReturnValue(V2_CONT)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' }, NOW)

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 6,
      best: 10,
      status: StreakStatus.ACTIVE,
    }), expect.anything())
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_UPDATED' }),
      expect.anything()
    )
  })

  it('resets to 1 on recovery from BROKEN and emits STREAK_RECOVERED', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(BROKEN_STREAK)
    vi.mocked(recomputeMod.recomputeStreak).mockReturnValue(V2_RECOVER)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' }, NOW)

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 1,
      status: StreakStatus.ACTIVE,
    }), expect.anything())
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_RECOVERED' }),
      expect.anything()
    )
  })

  it('monotonic gate: skips streak writes when localDate <= lastVerifiedDate', async () => {
    // ACTIVE_STREAK.lastVerifiedDate = '2024-01-14'; a workout whose local day is
    // the same (or earlier) must NOT touch the streak — but must NOT throw either
    // (the post stays verified; the surrounding transaction still commits).
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)
    vi.mocked(recomputeMod.toLocalDateStr).mockReturnValue('2024-01-14')

    await onWorkoutVerified({ postId: 'post-same-day', userId: 'user-1' }, NOW)

    expect(repo.createDailyCompletion).not.toHaveBeenCalled()
    expect(repo.updateStreak).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('passes post.createdAt to toLocalDateStr — not AI processing time', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' }, NOW)

    expect(repo.getPostCreatedAt).toHaveBeenCalledWith('post-1', expect.anything())
    expect(recomputeMod.toLocalDateStr).toHaveBeenCalledWith(NOW, 'UTC')
  })

  it('passes the localDate from toLocalDateStr to createDailyCompletion', async () => {
    vi.mocked(recomputeMod.toLocalDateStr).mockReturnValue('2024-01-15')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(new Date('2024-01-15T00:01:00Z'))
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-midnight', userId: 'user-1' }, NOW)

    expect(repo.createDailyCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ localDate: '2024-01-15' }),
      expect.anything()
    )
  })

  // A missing prerequisite now THROWS (no silent return) so the surrounding
  // transaction rolls back — never a VERIFIED post with a half-applied streak.
  it('throws (rolls back) when post not found', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(null)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)

    await expect(onWorkoutVerified({ postId: 'ghost-post', userId: 'user-1' }, NOW)).rejects.toThrow()
    expect(repo.updateStreak).not.toHaveBeenCalled()
  })

  it('throws (rolls back) when user timezone not found', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getUserTimezone).mockResolvedValue(null)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)

    await expect(onWorkoutVerified({ postId: 'post-1', userId: 'ghost-user' }, NOW)).rejects.toThrow()
    expect(repo.updateStreak).not.toHaveBeenCalled()
  })

  it('throws (rolls back) when streak record not found', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(null)

    await expect(onWorkoutVerified({ postId: 'post-1', userId: 'user-1' }, NOW)).rejects.toThrow()
    expect(repo.updateStreak).not.toHaveBeenCalled()
  })
})

describe('getMyStreak', () => {
  it('returns v2 shape — no deadline fields, has displayTier + completedToday', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)
    vi.mocked(repo.hasDailyCompletion).mockResolvedValue(false)
    vi.mocked(recomputeMod.deriveDisplayTier).mockReturnValue('PENDING_TODAY')

    const result = await getMyStreak('user-1', NOW)

    expect(result).toMatchObject({
      current: 5,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedDate: '2024-01-14',
      completedToday: false,
      displayTier: 'PENDING_TODAY',
    })
    expect(result).not.toHaveProperty('nextDeadline')
    expect(result).not.toHaveProperty('atRiskAt')
    expect(result).not.toHaveProperty('lastVerifiedAt')
  })

  it('returns COMPLETED_TODAY when user has a completion for today', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)
    vi.mocked(repo.hasDailyCompletion).mockResolvedValue(true)
    vi.mocked(recomputeMod.deriveDisplayTier).mockReturnValue('COMPLETED_TODAY')

    const result = await getMyStreak('user-1', NOW)

    expect(result?.completedToday).toBe(true)
    expect(result?.displayTier).toBe('COMPLETED_TODAY')
  })

  it('passes localToday + localHour to deriveDisplayTier', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)
    vi.mocked(recomputeMod.toLocalDateStr).mockReturnValue('2024-01-15')
    vi.mocked(recomputeMod.getLocalHour).mockReturnValue(21)

    await getMyStreak('user-1', NOW)

    expect(recomputeMod.deriveDisplayTier).toHaveBeenCalledWith(
      StreakStatus.ACTIVE,
      expect.any(Boolean),
      21
    )
  })

  it('returns BROKEN displayTier for BROKEN streak', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(BROKEN_STREAK)
    vi.mocked(recomputeMod.deriveDisplayTier).mockReturnValue('BROKEN')

    const result = await getMyStreak('user-1', NOW)

    expect(result?.status).toBe(StreakStatus.BROKEN)
    expect(result?.displayTier).toBe('BROKEN')
  })

  it('returns INACTIVE displayTier for INACTIVE streak with zero completedToday', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)
    vi.mocked(recomputeMod.deriveDisplayTier).mockReturnValue('INACTIVE')

    const result = await getMyStreak('user-1', NOW)

    expect(result?.displayTier).toBe('INACTIVE')
    expect(result?.completedToday).toBe(false)
  })

  it('returns null when streak record does not exist', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(null)
    expect(await getMyStreak('user-new', NOW)).toBeNull()
  })
})

describe('getPublicStreak', () => {
  it('returns public streak without lastVerifiedAt', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)

    const result = await getPublicStreak('user-1')

    expect(result).toEqual({
      current: 5,
      best: 10,
      status: StreakStatus.ACTIVE,
    })
    expect(result).not.toHaveProperty('lastVerifiedAt')
  })
})
