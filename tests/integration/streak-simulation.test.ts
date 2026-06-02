/**
 * streak-simulation.test.ts — Deterministic streak day simulator (debugging tool).
 *
 * Validates streak progression (1 → 2 → 3 → …) WITHOUT waiting for real time,
 * real midnights, or a database. It drives the REAL onWorkoutVerified flow and
 * the REAL recomputeStreak engine; only the persistence layer (streaks.repo) is
 * replaced with an in-memory store so the run is instant and reproducible.
 *
 * Two existing seams make this possible with ZERO production changes:
 *   1. onWorkoutVerified(params, _now?, db?) already accepts an injectable clock.
 *   2. A completion's localDate is derived from post.createdAt (read via the
 *      repo) — so the in-memory post's createdAt fully controls the "day".
 *
 * Run:
 *   npx vitest run tests/integration/streak-simulation.test.ts
 *   # add --reporter=verbose to always see the console progression table
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus } from '@prisma/client'

// In-memory backing store, created before the mocks are hoisted.
const store = vi.hoisted(() => ({
  posts: new Map<string, Date>(), // postId -> createdAt
  users: new Map<string, string>(), // userId -> IANA timezone
  completions: [] as Array<{ userId: string; localDate: string; postId: string; timezone: string }>,
  streak: null as null | {
    id: string
    userId: string
    current: number
    best: number
    status: StreakStatus
    lastVerifiedDate: string | null
    brokenAt: Date | null
  },
  events: [] as Array<{ type: string; userId: string; payload: Record<string, unknown> }>,
}))

// Replace ONLY persistence. The store mirrors the real invariants that matter:
// createDailyCompletion enforces UNIQUE(userId, localDate) by throwing like P2002.
vi.mock('../../server/modules/streaks/streaks.repo', () => ({
  getPostCreatedAt: vi.fn(async (postId: string) => store.posts.get(postId) ?? null),
  getUserTimezone: vi.fn(async (userId: string) => store.users.get(userId) ?? null),
  getStreakByUserId: vi.fn(async () => (store.streak ? { ...store.streak } : null)),
  createDailyCompletion: vi.fn(
    async (p: { userId: string; localDate: string; postId: string; timezone: string }) => {
      if (store.completions.some((c) => c.userId === p.userId && c.localDate === p.localDate)) {
        const err = new Error('Unique constraint failed (userId, localDate)') as Error & { code: string }
        err.code = 'P2002'
        throw err
      }
      store.completions.push(p)
    }
  ),
  getCompletionsForUser: vi.fn(async (userId: string) =>
    store.completions.filter((c) => c.userId === userId).map((c) => ({ localDate: c.localDate }))
  ),
  updateStreak: vi.fn(async (userId: string, data: Record<string, unknown>) => {
    store.streak = { ...store.streak!, ...data } as typeof store.streak
  }),
  persistStreakEvent: vi.fn(async (ev: { type: string; userId: string; payload: Record<string, unknown> }) => {
    store.events.push(ev)
  }),
  hasDailyCompletion: vi.fn(async (userId: string, localDate: string) =>
    store.completions.some((c) => c.userId === userId && c.localDate === localDate)
  ),
  markStreakBroken: vi.fn(),
  getActiveStreaksV2ForEvaluation: vi.fn(),
}))

// Avoid constructing a real PrismaClient for onWorkoutVerified's default db arg.
vi.mock('../../app/web/lib/prisma', () => ({ prisma: {} }))
vi.mock('../../server/core/logger/index', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

// REAL service + REAL engine (recomputeStreak / toLocalDateStr are NOT mocked).
import { onWorkoutVerified } from '../../server/modules/streaks/streaks.service'
import { toLocalDateStr } from '../../server/modules/streaks/recomputeStreak'

const USER_ID = 'sim-user'
const TZ = 'UTC'
const BASE = new Date('2025-01-01T12:00:00Z') // any fixed instant; tz=UTC keeps days obvious
const DAY_MS = 24 * 60 * 60 * 1000
const addDays = (n: number) => new Date(BASE.getTime() + n * DAY_MS)

function resetState() {
  store.posts.clear()
  store.users.clear()
  store.completions.length = 0
  store.events.length = 0
  store.users.set(USER_ID, TZ)
  store.streak = {
    id: 'sim-streak',
    userId: USER_ID,
    current: 0,
    best: 0,
    status: StreakStatus.INACTIVE,
    lastVerifiedDate: null,
    brokenAt: null,
  }
}

/** Simulate one verified workout on the day `dayOffset` days after BASE. */
async function postOnDay(dayOffset: number, postId: string) {
  const day = addDays(dayOffset)
  store.posts.set(postId, day) // controls createdAt → controls localDate
  await onWorkoutVerified({ postId, userId: USER_ID }, day) // _now = same instant
  return day
}

const lastEvent = () => store.events.at(-1)?.type ?? '(none)'

beforeEach(resetState)

describe('streak day simulation — deterministic, no real clock, no DB', () => {
  it('increments 1 → 2 → 3 → 4 → 5 across five simulated consecutive days', async () => {
    const DAYS = 5
    console.log(`\n── Simulating ${DAYS} consecutive days (tz=${TZ}) ──`)

    for (let i = 0; i < DAYS; i++) {
      const day = await postOnDay(i, `sim-post-${i + 1}`)
      const s = store.streak!
      console.log(
        `Day ${i + 1}  ${toLocalDateStr(day, TZ)}  ` +
          `current=${s.current}  best=${s.best}  status=${s.status}  event=${lastEvent()}`
      )

      // Progression is exact and deterministic.
      expect(s.current).toBe(i + 1)
      expect(s.best).toBe(i + 1)
      expect(s.status).toBe(StreakStatus.ACTIVE)
      expect(lastEvent()).toBe('STREAK_UPDATED')
    }
  })

  it('same-day re-submit does not increment (monotonic gate, no event)', async () => {
    for (let i = 0; i < 3; i++) await postOnDay(i, `sim-post-${i + 1}`)
    const before = store.streak!.current
    const eventsBefore = store.events.length

    console.log('\n── Same-day re-submit on day 3 ──')
    await postOnDay(2, 'sim-post-dup') // same localDate as the last completion

    const s = store.streak!
    console.log(`Re-post  ${toLocalDateStr(addDays(2), TZ)}  current=${s.current}  (was ${before})  event=${lastEvent()}`)

    expect(s.current).toBe(before) // unchanged
    expect(store.events.length).toBe(eventsBefore) // no new streak event
  })

  it('a gap then a post resets to 1 and emits STREAK_RECOVERED, preserving best', async () => {
    for (let i = 0; i < 5; i++) await postOnDay(i, `sim-post-${i + 1}`) // run of 5, best=5

    console.log('\n── Skip 2 days (days 6 & 7 missed), then post on day 8 ──')
    const day = await postOnDay(7, 'sim-post-recover') // 2025-01-08, gap of 2

    const s = store.streak!
    console.log(
      `Day 8  ${toLocalDateStr(day, TZ)}  current=${s.current}  best=${s.best}  status=${s.status}  event=${lastEvent()}`
    )

    expect(s.current).toBe(1)
    expect(s.best).toBe(5) // best run preserved
    expect(s.status).toBe(StreakStatus.ACTIVE)
    expect(lastEvent()).toBe('STREAK_RECOVERED')
  })
})
