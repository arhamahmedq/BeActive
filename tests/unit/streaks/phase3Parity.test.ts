/**
 * Phase 3 parity comparison tests.
 *
 * Validates the match/diverge logic that drives validate-streak-parity.mjs,
 * using the canonical recomputeStreak pure function so both the script and
 * the tests stay in sync automatically.
 */

import { describe, it, expect } from 'vitest'
import { StreakStatus } from '@prisma/client'
import { recomputeStreak, toLocalDateStr } from '../../../server/modules/streaks/recomputeStreak'

// Mirrors parityMatch() in scripts/validate-streak-parity.mjs
function parityMatch(
  stored: {
    current: number
    best: number
    status: string
    lastVerifiedDate: string | null
  },
  computed: ReturnType<typeof recomputeStreak>
): boolean {
  return (
    stored.current === computed.currentStreak &&
    stored.best === computed.bestStreak &&
    stored.status === computed.status &&
    (stored.lastVerifiedDate ?? null) === (computed.lastVerifiedDate ?? null)
  )
}

const NOW = new Date('2024-01-20T10:00:00Z')

describe('Phase 3 — parity comparison (parityMatch)', () => {
  it('MATCH: active 3-day streak with correct stored projection', () => {
    const completions = [
      { localDate: '2024-01-18' },
      { localDate: '2024-01-19' },
      { localDate: '2024-01-20' },
    ]
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(
      parityMatch({ current: 3, best: 3, status: 'ACTIVE', lastVerifiedDate: '2024-01-20' }, v2)
    ).toBe(true)
  })

  it('MATCH: INACTIVE user with no completions and zero stored values', () => {
    const v2 = recomputeStreak([], 'UTC', NOW)
    expect(
      parityMatch({ current: 0, best: 0, status: 'INACTIVE', lastVerifiedDate: null }, v2)
    ).toBe(true)
  })

  it('MATCH: BROKEN stored matches v2 BROKEN (gap > 1 day)', () => {
    const completions = [{ localDate: '2024-01-15' }] // 5 days before NOW
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(v2.status).toBe(StreakStatus.BROKEN)
    expect(
      parityMatch({ current: 1, best: 1, status: 'BROKEN', lastVerifiedDate: '2024-01-15' }, v2)
    ).toBe(true)
  })

  it('MATCH: best preserved from historical run after gap + new streak', () => {
    const completions = [
      { localDate: '2024-01-01' }, { localDate: '2024-01-02' }, { localDate: '2024-01-03' },
      { localDate: '2024-01-04' }, { localDate: '2024-01-05' }, { localDate: '2024-01-06' },
      { localDate: '2024-01-07' },
      // 11-day gap
      { localDate: '2024-01-19' },
      { localDate: '2024-01-20' },
    ]
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(v2.currentStreak).toBe(2)
    expect(v2.bestStreak).toBe(7)
    expect(
      parityMatch({ current: 2, best: 7, status: 'ACTIVE', lastVerifiedDate: '2024-01-20' }, v2)
    ).toBe(true)
  })

  it('DIVERGED: stored current=5 but ledger only shows 3-day streak', () => {
    const completions = [
      { localDate: '2024-01-18' },
      { localDate: '2024-01-19' },
      { localDate: '2024-01-20' },
    ]
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    // v1 stored current=5 (e.g. rolled up incorrectly)
    expect(
      parityMatch({ current: 5, best: 5, status: 'ACTIVE', lastVerifiedDate: '2024-01-20' }, v2)
    ).toBe(false)
  })

  it('DIVERGED: stored status=ACTIVE but v2 recompute is BROKEN', () => {
    const completions = [{ localDate: '2024-01-15' }] // 5 days behind NOW
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(v2.status).toBe(StreakStatus.BROKEN)
    // v1 stored ACTIVE (rolling 24h window was still open at evaluation time)
    expect(
      parityMatch({ current: 1, best: 1, status: 'ACTIVE', lastVerifiedDate: '2024-01-15' }, v2)
    ).toBe(false)
  })

  it('DIVERGED: lastVerifiedDate in stored is stale', () => {
    const completions = [
      { localDate: '2024-01-19' },
      { localDate: '2024-01-20' },
    ]
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(
      parityMatch({ current: 2, best: 2, status: 'ACTIVE', lastVerifiedDate: '2024-01-18' }, v2)
    ).toBe(false)
  })

  it('DIVERGED: stored best is lower than what ledger computes', () => {
    const completions = [
      { localDate: '2024-01-10' }, { localDate: '2024-01-11' }, { localDate: '2024-01-12' },
      { localDate: '2024-01-13' }, { localDate: '2024-01-14' },
      // gap
      { localDate: '2024-01-20' },
    ]
    const v2 = recomputeStreak(completions, 'UTC', NOW)
    expect(v2.bestStreak).toBe(5)
    // Stored best=3 (v1 never saw the full run)
    expect(
      parityMatch({ current: 1, best: 3, status: 'ACTIVE', lastVerifiedDate: '2024-01-20' }, v2)
    ).toBe(false)
  })
})

describe('Phase 3 — backfill localDate computation', () => {
  // These tests verify that toLocalDateStr (used by the backfill script)
  // produces the right localDate for the post's createdAt in the user's tz.
  // toLocalDateStr is already covered exhaustively by recomputeStreak.test.ts;
  // these add the backfill-specific framing.

  it('backfill uses post.createdAt in user tz to compute localDate', () => {
    // UTC Jan 15 05:00 = NYC Jan 15 00:00 (EST, UTC-5)
    const post = new Date('2024-01-15T05:00:00Z')
    expect(toLocalDateStr(post, 'UTC')).toBe('2024-01-15')
    expect(toLocalDateStr(post, 'America/New_York')).toBe('2024-01-15')
  })

  it('backfill assigns the correct local date for a late-night post', () => {
    // Sydney user posts at 23:30 local; UTC = local - 11h = 12:30 UTC same day (AEDT = UTC+11)
    const post = new Date('2024-01-15T12:30:00Z')
    expect(toLocalDateStr(post, 'Australia/Sydney')).toBe('2024-01-15')
  })

  it('backfill correctly dates a post that crosses UTC midnight in user tz', () => {
    // 23:00 UTC Jan 14 = 08:00 JST Jan 15 (Tokyo = UTC+9)
    const post = new Date('2024-01-14T23:00:00Z')
    expect(toLocalDateStr(post, 'UTC')).toBe('2024-01-14')
    expect(toLocalDateStr(post, 'Asia/Tokyo')).toBe('2024-01-15')
  })
})
