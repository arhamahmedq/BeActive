import { describe, it, expect } from 'vitest'
import { StreakStatus } from '@prisma/client'
import {
  recomputeStreak,
  deriveDisplayTier,
  toLocalDateStr,
  getLocalHour,
  EVENING_HOUR,
} from '../../../server/modules/streaks/recomputeStreak'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rows(...dates: string[]) {
  return dates.map((d) => ({ localDate: d }))
}

// Construct a UTC instant from a local date+time string in a given IANA timezone.
// e.g. localInstant('2026-06-01', '11:59', 'America/New_York')
function localInstant(date: string, time: string, tz: string): Date {
  // Build an ISO-like string and parse via Intl to get the UTC equivalent
  const [h, m] = time.split(':').map(Number)
  // Use Temporal-free approach: try instants near noon of that date (UTC) and
  // binary-converge by comparing the local date back. For tests, it's simpler
  // to use a known UTC offset derived from the first Intl query.
  const approxUtc = new Date(`${date}T12:00:00Z`)
  const localStr = toLocalDateStr(approxUtc, tz)
  const dayDiff =
    Math.floor(approxUtc.getTime() / 86_400_000) -
    Math.floor(
      new Date(localStr + 'T00:00:00Z').getTime() / 86_400_000
    )
  // The offset from UTC midnight to local midnight (in hours)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  // Get the UTC time that corresponds to local midnight on `date`
  // by working backwards from approxUtc
  const approxLocalHour = parseInt(
    formatter.format(approxUtc).split(':')[0],
    10
  )
  const approxLocalMin = parseInt(
    formatter.format(approxUtc).split(':')[1] ?? '0',
    10
  )
  // offset = how many minutes UTC is ahead of local
  const offsetMinutes = (12 * 60 - (approxLocalHour * 60 + approxLocalMin)) - dayDiff * 24 * 60
  const targetMinutesFromUtcMidnight = h * 60 + m + offsetMinutes
  return new Date(
    Date.UTC(...(date.split('-').map(Number) as [number, number, number])) -
      offsetMinutes * 60_000 +
      (h * 60 + m) * 60_000
  )
}

// Simpler helper: build a UTC Date that represents a specific UTC timestamp.
// Use this for UTC-only tests to avoid tz complexity.
function utc(dateStr: string, timeStr = '12:00:00'): Date {
  return new Date(`${dateStr}T${timeStr}Z`)
}

// ─── recomputeStreak: core counting ──────────────────────────────────────────

describe('recomputeStreak — core counting', () => {
  it('returns INACTIVE with zeros when no completions exist', () => {
    const result = recomputeStreak([], 'UTC', utc('2026-06-01'))
    expect(result).toEqual({
      currentStreak: 0,
      bestStreak: 0,
      lastVerifiedDate: null,
      status: StreakStatus.INACTIVE,
    })
  })

  it('single completion on exactly today → ACTIVE current=1 best=1', () => {
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', utc('2026-06-01'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(result.currentStreak).toBe(1)
    expect(result.bestStreak).toBe(1)
    expect(result.lastVerifiedDate).toBe('2026-06-01')
  })

  it('single completion yesterday → ACTIVE (still have today)', () => {
    // today = June 2, last verified June 1 → daysSince=1 → ACTIVE
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', utc('2026-06-02'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(result.currentStreak).toBe(1)
  })

  it('single completion 2 days ago → BROKEN', () => {
    // today = June 3, last verified June 1 → daysSince=2 → BROKEN
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', utc('2026-06-03'))
    expect(result.status).toBe(StreakStatus.BROKEN)
    expect(result.currentStreak).toBe(1) // preserved for display
    expect(result.bestStreak).toBe(1)
  })

  it('two consecutive days → current=2 best=2', () => {
    const result = recomputeStreak(
      rows('2026-06-01', '2026-06-02'),
      'UTC',
      utc('2026-06-02')
    )
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(result.currentStreak).toBe(2)
    expect(result.bestStreak).toBe(2)
  })

  it('five consecutive days → current=5 best=5', () => {
    const result = recomputeStreak(
      rows('2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'),
      'UTC',
      utc('2026-06-05')
    )
    expect(result.currentStreak).toBe(5)
    expect(result.bestStreak).toBe(5)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('gap in the middle resets run; best preserved', () => {
    // 3-day run, gap, 2-day run; currently broken (3 days after last)
    const result = recomputeStreak(
      rows('2026-06-01', '2026-06-02', '2026-06-03', '2026-06-10', '2026-06-11'),
      'UTC',
      utc('2026-06-14') // 3 days after June 11
    )
    expect(result.status).toBe(StreakStatus.BROKEN)
    expect(result.currentStreak).toBe(2) // last run was 2
    expect(result.bestStreak).toBe(3)    // first run was 3
    expect(result.lastVerifiedDate).toBe('2026-06-11')
  })

  it('gap then new run today → ACTIVE with correct current and best', () => {
    // 3-day run, gap, then 2-day run ending today
    const result = recomputeStreak(
      rows('2026-06-01', '2026-06-02', '2026-06-03', '2026-06-10', '2026-06-11'),
      'UTC',
      utc('2026-06-11') // today IS the last verified date
    )
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(result.currentStreak).toBe(2)
    expect(result.bestStreak).toBe(3)
  })

  it('multiple gaps — tracks best across all runs', () => {
    const result = recomputeStreak(
      rows(
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', // 4
        '2026-02-01', '2026-02-02',                               // 2 (gap)
        '2026-03-01',                                             // 1 (gap)
        '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', // 6 (gap)
      ),
      'UTC',
      utc('2026-06-06')
    )
    expect(result.currentStreak).toBe(6)
    expect(result.bestStreak).toBe(6)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('best run was historical, not the current run', () => {
    const result = recomputeStreak(
      rows(
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', // 5
        '2026-06-01', '2026-06-02', // 2 (gap before)
      ),
      'UTC',
      utc('2026-06-02')
    )
    expect(result.currentStreak).toBe(2)
    expect(result.bestStreak).toBe(5)
  })

  it('unsorted input is handled correctly (defensive sort)', () => {
    const result = recomputeStreak(
      [
        { localDate: '2026-06-03' },
        { localDate: '2026-06-01' },
        { localDate: '2026-06-02' },
      ],
      'UTC',
      utc('2026-06-03')
    )
    expect(result.currentStreak).toBe(3)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('duplicate dates in input treated as one (UNIQUE violation in prod)', () => {
    // Defensive: if somehow two rows share a date, they should not double-count
    const result = recomputeStreak(
      rows('2026-06-01', '2026-06-01', '2026-06-02'),
      'UTC',
      utc('2026-06-02')
    )
    // After de-dup via sort+skip, should be: 2 consecutive days
    expect(result.currentStreak).toBe(2)
  })

  it('exactly at the break boundary: today === D+1 → still ACTIVE', () => {
    // If lastVerified = June 1 and today = June 2, daysSince = 1 → ACTIVE
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', utc('2026-06-02', '23:59:00'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('one second past break boundary: today === D+2 → BROKEN', () => {
    // If lastVerified = June 1 and today = June 3, daysSince = 2 → BROKEN
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', utc('2026-06-03', '00:00:01'))
    expect(result.status).toBe(StreakStatus.BROKEN)
  })
})

// ─── recomputeStreak: month and year boundaries ───────────────────────────────

describe('recomputeStreak — month and year boundaries', () => {
  it('consecutive across month boundary (Jan 31 → Feb 1)', () => {
    const result = recomputeStreak(
      rows('2026-01-31', '2026-02-01'),
      'UTC',
      utc('2026-02-01')
    )
    expect(result.currentStreak).toBe(2)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('consecutive across year boundary (Dec 31 → Jan 1)', () => {
    const result = recomputeStreak(
      rows('2025-12-31', '2026-01-01'),
      'UTC',
      utc('2026-01-01')
    )
    expect(result.currentStreak).toBe(2)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('gap across month boundary (Jan 31 → Feb 2) → run restarts', () => {
    const result = recomputeStreak(
      rows('2026-01-31', '2026-02-02'),
      'UTC',
      utc('2026-02-02')
    )
    expect(result.currentStreak).toBe(1)
    expect(result.bestStreak).toBe(1)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('leap year: Feb 28 → Feb 29 → Mar 1 all consecutive (2028)', () => {
    const result = recomputeStreak(
      rows('2028-02-28', '2028-02-29', '2028-03-01'),
      'UTC',
      utc('2028-03-01')
    )
    expect(result.currentStreak).toBe(3)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })
})

// ─── toLocalDateStr: timezone resolution ─────────────────────────────────────

describe('toLocalDateStr — timezone resolution', () => {
  it('UTC: returns the same date as the UTC date', () => {
    expect(toLocalDateStr(new Date('2026-06-01T12:00:00Z'), 'UTC')).toBe('2026-06-01')
  })

  it('UTC midnight stays on the same date', () => {
    expect(toLocalDateStr(new Date('2026-06-01T00:00:00Z'), 'UTC')).toBe('2026-06-01')
  })

  it('America/New_York (UTC-5 in Jan): UTC 2025-01-01T04:59:59Z → local Dec 31', () => {
    expect(toLocalDateStr(new Date('2025-01-01T04:59:59Z'), 'America/New_York')).toBe('2024-12-31')
  })

  it('America/New_York (UTC-5 in Jan): UTC 2025-01-01T05:00:00Z → local Jan 1', () => {
    expect(toLocalDateStr(new Date('2025-01-01T05:00:00Z'), 'America/New_York')).toBe('2025-01-01')
  })

  it('Asia/Tokyo (UTC+9): UTC midnight is 9am local same day', () => {
    expect(toLocalDateStr(new Date('2026-06-01T00:00:00Z'), 'Asia/Tokyo')).toBe('2026-06-01')
  })

  it('Asia/Tokyo: 3pm UTC (midnight local next day) → next day', () => {
    // 2026-06-01T15:00:00Z = 2026-06-02T00:00:00 JST
    expect(toLocalDateStr(new Date('2026-06-01T15:00:00Z'), 'Asia/Tokyo')).toBe('2026-06-02')
  })

  it('Asia/Tokyo: just before midnight local (2026-06-01T14:59:59Z) → same day', () => {
    // 2026-06-01T14:59:59Z = 2026-06-01T23:59:59 JST
    expect(toLocalDateStr(new Date('2026-06-01T14:59:59Z'), 'Asia/Tokyo')).toBe('2026-06-01')
  })

  it('Australia/Sydney (AEST UTC+10 in June): UTC 2026-06-01T13:59:00Z → June 1 local', () => {
    // 2026-06-01T13:59:00Z = 2026-06-01T23:59:00+10:00 AEST
    expect(toLocalDateStr(new Date('2026-06-01T13:59:00Z'), 'Australia/Sydney')).toBe('2026-06-01')
  })

  it('Australia/Sydney: UTC 2026-06-01T14:00:00Z → June 2 local (midnight AEST)', () => {
    // 2026-06-01T14:00:00Z = 2026-06-02T00:00:00+10:00 AEST
    expect(toLocalDateStr(new Date('2026-06-01T14:00:00Z'), 'Australia/Sydney')).toBe('2026-06-02')
  })

  it('DST spring-forward (America/New_York, 2026-03-08): 23h day still yields correct dates', () => {
    // US clocks spring forward 2am → 3am on 2026-03-08
    // 2026-03-08T06:59:59Z = 2026-03-08T01:59:59 EST  → local: Mar 8
    expect(toLocalDateStr(new Date('2026-03-08T06:59:59Z'), 'America/New_York')).toBe('2026-03-08')
    // 2026-03-08T07:00:01Z = 2026-03-08T03:00:01 EDT  → local: Mar 8 (clocks jumped to 3am)
    expect(toLocalDateStr(new Date('2026-03-08T07:00:01Z'), 'America/New_York')).toBe('2026-03-08')
  })

  it('DST spring-forward: 11:59pm local still counts as same day', () => {
    // 2026-03-09T03:59:00Z = 2026-03-08T23:59:00 EDT (-4)
    expect(toLocalDateStr(new Date('2026-03-09T03:59:00Z'), 'America/New_York')).toBe('2026-03-08')
  })

  it('DST fall-back (America/New_York, 2026-11-01): 25h day still yields correct dates', () => {
    // US clocks fall back 2am → 1am on 2026-11-01
    // Just before fall-back: 2026-11-01T05:59:59Z = 2026-11-01T01:59:59 EDT (-4)
    expect(toLocalDateStr(new Date('2026-11-01T05:59:59Z'), 'America/New_York')).toBe('2026-11-01')
    // Just after fall-back: 2026-11-01T06:00:01Z = 2026-11-01T01:00:01 EST (-5)
    expect(toLocalDateStr(new Date('2026-11-01T06:00:01Z'), 'America/New_York')).toBe('2026-11-01')
  })

  it('two users at the same UTC instant get different local dates', () => {
    const instant = new Date('2026-06-01T23:30:00Z')
    const nyDate = toLocalDateStr(instant, 'America/New_York')  // June 1, 7:30pm ET
    const tokyoDate = toLocalDateStr(instant, 'Asia/Tokyo')     // June 2, 8:30am JST

    expect(nyDate).toBe('2026-06-01')
    expect(tokyoDate).toBe('2026-06-02')
    expect(nyDate).not.toBe(tokyoDate)
  })

  it('Singapore (Asia/Singapore, no DST): stable UTC+8 all year', () => {
    const instant = new Date('2026-06-01T15:59:00Z') // 11:59pm SGT
    expect(toLocalDateStr(instant, 'Asia/Singapore')).toBe('2026-06-01')

    const instant2 = new Date('2026-06-01T16:00:00Z') // midnight SGT
    expect(toLocalDateStr(instant2, 'Asia/Singapore')).toBe('2026-06-02')
  })
})

// ─── recomputeStreak: timezone-aware break detection ─────────────────────────

describe('recomputeStreak — timezone-aware break detection', () => {
  it('11:59 PM local still counts as "today" for break purposes', () => {
    // User in NYC, last verified June 1 (local), now is June 2 at 11:59pm local
    // 2026-06-03T03:59:59Z = 2026-06-02T23:59:59 EDT
    const now = new Date('2026-06-03T03:59:59Z')
    const result = recomputeStreak(rows('2026-06-01'), 'America/New_York', now)
    // daysSince = June2 - June1 = 1 → still ACTIVE (today is June 2, still have time)
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('12:01 AM local the day after break threshold → BROKEN', () => {
    // User in NYC, last verified June 1, now is June 3 at 12:01am local
    // 2026-06-03T04:01:00Z = 2026-06-03T00:01:00 EDT
    const now = new Date('2026-06-03T04:01:00Z')
    const result = recomputeStreak(rows('2026-06-01'), 'America/New_York', now)
    // daysSince = June3 - June1 = 2 → BROKEN
    expect(result.status).toBe(StreakStatus.BROKEN)
    expect(result.currentStreak).toBe(1)
  })

  it('verify crosses midnight: post.createdAt on prior day still credited to that day', () => {
    // User posted at 11:58pm local (June 1), AI verified at 12:05am (June 2).
    // The completion was recorded with localDate = June 1 (from post.createdAt).
    // Now it's June 2 at 8am — daysSince = 1 → ACTIVE
    const now = new Date('2026-06-02T12:00:00Z') // June 2 8am EDT
    const result = recomputeStreak(rows('2026-06-01'), 'America/New_York', now)
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(result.currentStreak).toBe(1)
  })

  it('Tokyo user: streak computed against Tokyo local dates', () => {
    // User in Tokyo. Last verified 2026-06-01 (Tokyo date).
    // Now = 2026-06-02T14:30:00Z = 2026-06-02T23:30:00 JST → still June 2 local
    // daysSince = June2 - June1 = 1 → ACTIVE
    const result = recomputeStreak(rows('2026-06-01'), 'Asia/Tokyo', new Date('2026-06-02T14:30:00Z'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
  })

  it('Tokyo user: just after local midnight on D+2 → BROKEN', () => {
    // 2026-06-03T15:00:00Z = 2026-06-04T00:00:00 JST → June 4
    // lastVerified = June 1, daysSince = 3 → BROKEN
    const result = recomputeStreak(rows('2026-06-01'), 'Asia/Tokyo', new Date('2026-06-03T15:00:00Z'))
    expect(result.status).toBe(StreakStatus.BROKEN)
  })
})

// ─── getLocalHour ─────────────────────────────────────────────────────────────

describe('getLocalHour', () => {
  it('midnight UTC → hour 0', () => {
    expect(getLocalHour(new Date('2026-06-01T00:00:00Z'), 'UTC')).toBe(0)
  })

  it('noon UTC → hour 12', () => {
    expect(getLocalHour(new Date('2026-06-01T12:00:00Z'), 'UTC')).toBe(12)
  })

  it('11pm UTC → hour 23', () => {
    expect(getLocalHour(new Date('2026-06-01T23:00:00Z'), 'UTC')).toBe(23)
  })

  it('2pm UTC in America/New_York (EDT, -4) → hour 10', () => {
    expect(getLocalHour(new Date('2026-06-01T14:00:00Z'), 'America/New_York')).toBe(10)
  })

  it('midnight UTC in Asia/Tokyo (+9) → hour 9', () => {
    expect(getLocalHour(new Date('2026-06-01T00:00:00Z'), 'Asia/Tokyo')).toBe(9)
  })
})

// ─── deriveDisplayTier ────────────────────────────────────────────────────────

describe('deriveDisplayTier', () => {
  it('INACTIVE → INACTIVE regardless of other inputs', () => {
    expect(deriveDisplayTier(StreakStatus.INACTIVE, false, 0)).toBe('INACTIVE')
    expect(deriveDisplayTier(StreakStatus.INACTIVE, true, 23)).toBe('INACTIVE')
  })

  it('BROKEN → BROKEN regardless of other inputs', () => {
    expect(deriveDisplayTier(StreakStatus.BROKEN, false, 0)).toBe('BROKEN')
    expect(deriveDisplayTier(StreakStatus.BROKEN, true, 12)).toBe('BROKEN')
  })

  it('ACTIVE + completedToday=true → COMPLETED_TODAY at any hour', () => {
    expect(deriveDisplayTier(StreakStatus.ACTIVE, true, 0)).toBe('COMPLETED_TODAY')
    expect(deriveDisplayTier(StreakStatus.ACTIVE, true, 23)).toBe('COMPLETED_TODAY')
  })

  it('ACTIVE + completedToday=false + hour before EVENING → PENDING_TODAY', () => {
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, 0)).toBe('PENDING_TODAY')
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, EVENING_HOUR - 1)).toBe('PENDING_TODAY')
  })

  it('ACTIVE + completedToday=false + hour at or after EVENING → AT_RISK', () => {
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, EVENING_HOUR)).toBe('AT_RISK')
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, 23)).toBe('AT_RISK')
  })

  it('respects custom eveningHour override', () => {
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, 18, 18)).toBe('AT_RISK')
    expect(deriveDisplayTier(StreakStatus.ACTIVE, false, 17, 18)).toBe('PENDING_TODAY')
  })
})

// ─── Integrated: recompute + derive ──────────────────────────────────────────

describe('recomputeStreak + deriveDisplayTier integrated', () => {
  it('new user: INACTIVE → INACTIVE tier', () => {
    const result = recomputeStreak([], 'UTC', utc('2026-06-01'))
    const tier = deriveDisplayTier(result.status, false, 12)
    expect(tier).toBe('INACTIVE')
  })

  it('just posted today, 2pm: COMPLETED_TODAY', () => {
    const now = utc('2026-06-01', '14:00:00')
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', now)
    const tier = deriveDisplayTier(result.status, true, getLocalHour(now, 'UTC'))
    expect(tier).toBe('COMPLETED_TODAY')
  })

  it('streak alive, not yet posted, 3pm local: PENDING_TODAY', () => {
    const now = utc('2026-06-02', '15:00:00')
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', now)
    // completedToday = false (no June 2 row)
    const tier = deriveDisplayTier(result.status, false, getLocalHour(now, 'UTC'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(tier).toBe('PENDING_TODAY')
  })

  it('streak alive, not yet posted, 9pm local: AT_RISK', () => {
    const now = utc('2026-06-02', '21:00:00')
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', now)
    const tier = deriveDisplayTier(result.status, false, getLocalHour(now, 'UTC'))
    expect(result.status).toBe(StreakStatus.ACTIVE)
    expect(tier).toBe('AT_RISK')
  })

  it('missed a day: BROKEN tier', () => {
    const now = utc('2026-06-03', '12:00:00')
    const result = recomputeStreak(rows('2026-06-01'), 'UTC', now)
    const tier = deriveDisplayTier(result.status, false, 12)
    expect(result.status).toBe(StreakStatus.BROKEN)
    expect(tier).toBe('BROKEN')
  })
})
