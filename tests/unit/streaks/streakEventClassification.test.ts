import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus } from '@prisma/client'

// REGRESSION SUITE for the "current unchanged + STREAK_UPDATED" production defect.
//
// Unlike streaks.service.test.ts, recomputeStreak is intentionally NOT mocked here.
// The bug lived in the SEAM between the real recomputed projection and the event-type
// decision, so the projection must be real for the test to have teeth.
vi.mock('../../../server/modules/streaks/streaks.repo')
vi.mock('../../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { onWorkoutVerified } from '../../../server/modules/streaks/streaks.service'
import * as repo from '../../../server/modules/streaks/streaks.repo'

function emittedEventType(): string | undefined {
  return vi.mocked(repo.persistStreakEvent).mock.calls[0]?.[0]?.type
}

function ledger(...dates: string[]): Array<{ localDate: string }> {
  return dates.map((localDate) => ({ localDate }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.getUserTimezone).mockResolvedValue('UTC')
  vi.mocked(repo.createDailyCompletion).mockResolvedValue(undefined)
  vi.mocked(repo.updateStreak).mockResolvedValue(undefined)
  vi.mocked(repo.persistStreakEvent).mockResolvedValue(undefined)
})

describe('onWorkoutVerified — event must reflect the ACTUAL transition, not the stale stored status', () => {
  it('REPRO: a workout after a missed day, while the cron has not yet marked BROKEN, is a recovery — not an update', async () => {
    // Stored projection LAGS reality (no cron has run in this window):
    //   5-day run ending Jan 10, still persisted as ACTIVE / current = 5.
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      id: 's1', userId: 'u1', current: 5, best: 5,
      status: StreakStatus.ACTIVE, lastVerifiedDate: '2024-01-10', brokenAt: null,
    })
    // New workout for Jan 13 — Jan 11 and 12 were missed.
    const now = new Date('2024-01-13T09:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(now)
    // Ledger after inserting the new (gapped) completion.
    vi.mocked(repo.getCompletionsForUser).mockResolvedValue(
      ledger('2024-01-06', '2024-01-07', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-13')
    )

    await onWorkoutVerified({ postId: 'p-jan13', userId: 'u1' }, now)

    // The count correctly restarts at 1 (best run of 5 preserved) ...
    expect(repo.updateStreak).toHaveBeenCalledWith('u1', expect.objectContaining({ current: 1, best: 5 }), expect.anything())
    // ... and the emitted event must say the streak lapsed & restarted, NOT continued.
    expect(emittedEventType()).toBe('STREAK_RECOVERED')
  })

  it('a normal consecutive-day workout is a continuation → STREAK_UPDATED', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      id: 's1', userId: 'u1', current: 1, best: 1,
      status: StreakStatus.ACTIVE, lastVerifiedDate: '2024-01-12', brokenAt: null,
    })
    const now = new Date('2024-01-13T09:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(now)
    vi.mocked(repo.getCompletionsForUser).mockResolvedValue(ledger('2024-01-12', '2024-01-13'))

    await onWorkoutVerified({ postId: 'p-jan13', userId: 'u1' }, now)

    expect(repo.updateStreak).toHaveBeenCalledWith('u1', expect.objectContaining({ current: 2 }), expect.anything())
    expect(emittedEventType()).toBe('STREAK_UPDATED')
  })

  it("a brand-new user's first workout is a fresh start → STREAK_UPDATED (not RECOVERED)", async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      id: 's1', userId: 'u1', current: 0, best: 0,
      status: StreakStatus.INACTIVE, lastVerifiedDate: null, brokenAt: null,
    })
    const now = new Date('2024-01-13T09:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(now)
    vi.mocked(repo.getCompletionsForUser).mockResolvedValue(ledger('2024-01-13'))

    await onWorkoutVerified({ postId: 'p-first', userId: 'u1' }, now)

    expect(repo.updateStreak).toHaveBeenCalledWith('u1', expect.objectContaining({ current: 1 }), expect.anything())
    expect(emittedEventType()).toBe('STREAK_UPDATED')
  })

  it('the canonical BROKEN → recovery path still emits STREAK_RECOVERED', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue({
      id: 's1', userId: 'u1', current: 7, best: 7,
      status: StreakStatus.BROKEN, lastVerifiedDate: '2024-01-07', brokenAt: new Date('2024-01-09T00:00:00Z'),
    })
    const now = new Date('2024-01-13T09:00:00Z')
    vi.mocked(repo.getPostCreatedAt).mockResolvedValue(now)
    vi.mocked(repo.getCompletionsForUser).mockResolvedValue(
      ledger('2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07', '2024-01-13')
    )

    await onWorkoutVerified({ postId: 'p-jan13', userId: 'u1' }, now)

    expect(repo.updateStreak).toHaveBeenCalledWith('u1', expect.objectContaining({ current: 1, best: 7 }), expect.anything())
    expect(emittedEventType()).toBe('STREAK_RECOVERED')
  })
})
