import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

vi.mock('../../../server/modules/streaks/streaks.repo')
vi.mock('../../../server/modules/users/users.service')
vi.mock('../../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { onWorkoutVerified, getMyStreak, getPublicStreak } from '../../../server/modules/streaks/streaks.service'
import * as repo from '../../../server/modules/streaks/streaks.repo'
import * as usersService from '../../../server/modules/users/users.service'

// Fixed clock: Jan 15 10:00 UTC
const NOW = new Date('2024-01-15T10:00:00Z')
const YESTERDAY = new Date('2024-01-14T10:00:00Z')

const INACTIVE_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 0, best: 0,
  status: StreakStatus.INACTIVE, lastVerifiedAt: null, brokenAt: null,
}
const ACTIVE_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 5, best: 10,
  status: StreakStatus.ACTIVE, lastVerifiedAt: YESTERDAY, brokenAt: null,
}
const BROKEN_STREAK = {
  id: 'streak-1', userId: 'user-1', current: 3, best: 7,
  status: StreakStatus.BROKEN,
  lastVerifiedAt: new Date('2024-01-13T10:00:00Z'),
  brokenAt: new Date('2024-01-14T10:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.updateStreak).mockResolvedValue(undefined)
  vi.mocked(usersService.setActivityState).mockResolvedValue(undefined)
  vi.mocked(repo.persistStreakEvent).mockResolvedValue(undefined)
})

describe('onWorkoutVerified', () => {
  it('starts streak at 1 for new user (INACTIVE → ACTIVE)', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' })

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 1,
      best: 1,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt: NOW,
      brokenAt: null,
    }))
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_UPDATED', userId: 'user-1' })
    )
  })

  it('increments streak for active user (ACTIVE → ACTIVE)', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' })

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 6,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt: NOW,
    }))
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_UPDATED' })
    )
  })

  it('resets to 1 on recovery from BROKEN, preserves best', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(BROKEN_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' })

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({
      current: 1,
      best: 7,
      status: StreakStatus.ACTIVE,
    }))
    expect(repo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_RECOVERED' })
    )
  })

  it('sets user activityState to ACTIVE on every update', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' })

    expect(usersService.setActivityState).toHaveBeenCalledWith('user-1', UserActivityState.ACTIVE)
  })

  it('skips if post.createdAt <= streak.lastVerifiedAt (idempotency)', async () => {
    const olderDate = new Date('2024-01-14T08:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(olderDate)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK) // lastVerifiedAt = Jan 14 10:00

    await onWorkoutVerified({ postId: 'post-old', userId: 'user-1' })

    expect(repo.updateStreak).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('skips second post on same UTC day (no double increment)', async () => {
    const sameDayLater = new Date('2024-01-14T18:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(sameDayLater)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(ACTIVE_STREAK) // lastVerifiedAt = Jan 14 10:00

    await onWorkoutVerified({ postId: 'post-same-day', userId: 'user-1' })

    expect(repo.updateStreak).not.toHaveBeenCalled()
  })

  it('credits a 00:01 post when last post was 23:59 the previous day', async () => {
    const lateNight = new Date('2024-01-14T23:59:00Z')
    const earlyNext = new Date('2024-01-15T00:01:00Z')
    const streakWithLatePost = { ...ACTIVE_STREAK, lastVerifiedAt: lateNight }
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(earlyNext)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(streakWithLatePost)

    await onWorkoutVerified({ postId: 'post-midnight', userId: 'user-1' })

    expect(repo.updateStreak).toHaveBeenCalledWith('user-1', expect.objectContaining({ current: 6 }))
  })

  it('does nothing when post not found', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(null)

    await onWorkoutVerified({ postId: 'ghost-post', userId: 'user-1' })

    expect(repo.updateStreak).not.toHaveBeenCalled()
  })

  it('does nothing when streak record not found', async () => {
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(NOW)
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(null)

    await onWorkoutVerified({ postId: 'post-1', userId: 'user-1' })

    expect(repo.updateStreak).not.toHaveBeenCalled()
  })
})

describe('getMyStreak', () => {
  it('returns full streak response with ISO lastVerifiedAt', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      ...ACTIVE_STREAK,
      lastVerifiedAt: new Date('2024-01-14T10:00:00Z'),
    })

    const result = await getMyStreak('user-1')

    expect(result).toEqual({
      current: 5,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt: '2024-01-14T10:00:00.000Z',
      nextDeadline: '2024-01-15T10:00:00.000Z',
      atRiskAt: '2024-01-15T06:00:00.000Z',
    })
  })

  it('returns null when streak record does not exist', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(null)
    const result = await getMyStreak('user-new')
    expect(result).toBeNull()
  })

  it('returns nextDeadline = lastVerifiedAt + 24h for ACTIVE streak', async () => {
    const lva = new Date('2024-01-14T10:00:00Z')
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      ...ACTIVE_STREAK,
      lastVerifiedAt: lva,
    })

    const result = await getMyStreak('user-1')

    expect(result?.nextDeadline).toBe('2024-01-15T10:00:00.000Z')
    expect(result?.atRiskAt).toBe('2024-01-15T06:00:00.000Z')
  })

  it('returns null nextDeadline and atRiskAt for INACTIVE streak', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

    const result = await getMyStreak('user-1')

    expect(result?.nextDeadline).toBeNull()
    expect(result?.atRiskAt).toBeNull()
  })

  it('returns non-null nextDeadline and atRiskAt for BROKEN streak (deadline is in the past)', async () => {
    const lva = new Date('2024-01-13T10:00:00Z')
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      ...BROKEN_STREAK,
      lastVerifiedAt: lva,
    })

    const result = await getMyStreak('user-1')

    expect(result?.status).toBe(StreakStatus.BROKEN)
    // deadline and atRiskAt are in the past — timer will show BROKEN / "Reset required"
    expect(result?.nextDeadline).toBe('2024-01-14T10:00:00.000Z')
    expect(result?.atRiskAt).toBe('2024-01-14T06:00:00.000Z')
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
