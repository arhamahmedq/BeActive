# Slice 4 — Streak Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic streak engine: increment streaks on verified workouts, detect at-risk (20h) and broken (24h) states via an hourly Vercel cron job, and expose two read-only streak API endpoints.

**Architecture:** The streak service is called directly from the AI classifier after WORKOUT_VERIFIED is persisted. An hourly Vercel Cron endpoint hits `/api/cron/streak-evaluator`, which runs the evaluator function. All streak state transitions are enforced by the state machine — no direct DB writes. All timestamps are UTC. The "same UTC day" guard prevents double-increment.

**Tech Stack:** Prisma + PostgreSQL, Vitest (unit tests with mocked Prisma), Next.js API routes (App Router), Vercel Cron Jobs, TypeScript strict mode, Zod.

---

## File Map

**Complete stubs → real implementations:**
- `server/core/state-machines/streak.machine.ts` — add `applyStreakTransition()` counter logic
- `server/core/state-machines/user.machine.ts` — add `assertUserTransition()` (remove stub throw)
- `server/modules/streaks/streaks.types.ts` — define all TS types
- `server/modules/streaks/streaks.schema.ts` — Zod schema for `[userId]` param
- `server/modules/streaks/streaks.repo.ts` — all Prisma queries (7 functions)
- `server/modules/streaks/streaks.service.ts` — `onWorkoutVerified`, `getMyStreak`, `getPublicStreak`
- `server/modules/streaks/streaks.controller.ts` — two route handlers
- `server/workers/aiClassifier.ts` — add 4-line streak hook after WORKOUT_VERIFIED (import + try/await)

**Create new:**
- `server/workers/streakEvaluator.ts` — `evaluateStreaks()` cron logic
- `app/web/app/api/streaks/me/route.ts` — GET /api/streaks/me
- `app/web/app/api/streaks/[userId]/route.ts` — GET /api/streaks/:userId
- `app/web/app/api/cron/streak-evaluator/route.ts` — protected cron endpoint
- `vercel.json` — cron schedule config
- `tests/unit/streaks/streak.machine.test.ts`
- `tests/unit/streaks/streaks.repo.test.ts`
- `tests/unit/streaks/streaks.service.test.ts`
- `tests/unit/streaks/streakEvaluator.test.ts`

---

## Task 1: State Machine Implementations

**Files:**
- Modify: `server/core/state-machines/streak.machine.ts`
- Modify: `server/core/state-machines/user.machine.ts`
- Create: `tests/unit/streaks/streak.machine.test.ts`

- [ ] **Step 1.1: Write failing tests for state machines**

Create `tests/unit/streaks/streak.machine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'
import {
  isValidStreakTransition,
  applyStreakTransition,
} from '../../server/core/state-machines/streak.machine'
import {
  isValidUserTransition,
  assertUserTransition,
} from '../../server/core/state-machines/user.machine'

describe('streak state machine — isValidStreakTransition', () => {
  it('allows INACTIVE → ACTIVE', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.ACTIVE)).toBe(true)
  })
  it('allows ACTIVE → ACTIVE (increment)', () => {
    expect(isValidStreakTransition(StreakStatus.ACTIVE, StreakStatus.ACTIVE)).toBe(true)
  })
  it('allows ACTIVE → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.ACTIVE, StreakStatus.BROKEN)).toBe(true)
  })
  it('allows BROKEN → ACTIVE (recovery)', () => {
    expect(isValidStreakTransition(StreakStatus.BROKEN, StreakStatus.ACTIVE)).toBe(true)
  })
  it('rejects INACTIVE → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.BROKEN)).toBe(false)
  })
  it('rejects BROKEN → BROKEN', () => {
    expect(isValidStreakTransition(StreakStatus.BROKEN, StreakStatus.BROKEN)).toBe(false)
  })
  it('rejects INACTIVE → INACTIVE', () => {
    expect(isValidStreakTransition(StreakStatus.INACTIVE, StreakStatus.INACTIVE)).toBe(false)
  })
})

describe('streak state machine — applyStreakTransition', () => {
  it('sets current=1 best=1 on INACTIVE → ACTIVE', () => {
    const result = applyStreakTransition(
      { current: 0, best: 0, status: StreakStatus.INACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 1, best: 1, status: StreakStatus.ACTIVE })
  })

  it('increments current on ACTIVE → ACTIVE', () => {
    const result = applyStreakTransition(
      { current: 5, best: 5, status: StreakStatus.ACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 6, best: 6, status: StreakStatus.ACTIVE })
  })

  it('preserves best when current is below best', () => {
    const result = applyStreakTransition(
      { current: 3, best: 10, status: StreakStatus.ACTIVE },
      StreakStatus.ACTIVE
    )
    expect(result.current).toBe(4)
    expect(result.best).toBe(10)
  })

  it('resets current=1 on BROKEN → ACTIVE, preserves best', () => {
    const result = applyStreakTransition(
      { current: 7, best: 12, status: StreakStatus.BROKEN },
      StreakStatus.ACTIVE
    )
    expect(result).toEqual({ current: 1, best: 12, status: StreakStatus.ACTIVE })
  })

  it('preserves counter on ACTIVE → BROKEN (no counter change)', () => {
    const result = applyStreakTransition(
      { current: 5, best: 5, status: StreakStatus.ACTIVE },
      StreakStatus.BROKEN
    )
    expect(result).toEqual({ current: 5, best: 5, status: StreakStatus.BROKEN })
  })

  it('throws on invalid transition INACTIVE → BROKEN', () => {
    expect(() =>
      applyStreakTransition({ current: 0, best: 0, status: StreakStatus.INACTIVE }, StreakStatus.BROKEN)
    ).toThrow('Invalid streak transition')
  })
})

describe('user activity state machine — isValidUserTransition', () => {
  it('allows ACTIVE → AT_RISK', () => {
    expect(isValidUserTransition(UserActivityState.ACTIVE, UserActivityState.AT_RISK)).toBe(true)
  })
  it('allows ACTIVE → ACTIVE (workout increment stays active)', () => {
    expect(isValidUserTransition(UserActivityState.ACTIVE, UserActivityState.ACTIVE)).toBe(true)
  })
  it('allows AT_RISK → BROKEN', () => {
    expect(isValidUserTransition(UserActivityState.AT_RISK, UserActivityState.BROKEN)).toBe(true)
  })
  it('allows AT_RISK → ACTIVE (recovery)', () => {
    expect(isValidUserTransition(UserActivityState.AT_RISK, UserActivityState.ACTIVE)).toBe(true)
  })
  it('allows BROKEN → ACTIVE (new workout)', () => {
    expect(isValidUserTransition(UserActivityState.BROKEN, UserActivityState.ACTIVE)).toBe(true)
  })
  it('rejects BROKEN → AT_RISK (no backwards)', () => {
    expect(isValidUserTransition(UserActivityState.BROKEN, UserActivityState.AT_RISK)).toBe(false)
  })
})

describe('user activity state machine — assertUserTransition', () => {
  it('does not throw on valid transition', () => {
    expect(() =>
      assertUserTransition(UserActivityState.ACTIVE, UserActivityState.AT_RISK)
    ).not.toThrow()
  })
  it('throws on invalid transition', () => {
    expect(() =>
      assertUserTransition(UserActivityState.BROKEN, UserActivityState.AT_RISK)
    ).toThrow('Invalid user activity transition')
  })
})
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
npm run test -- tests/unit/streaks/streak.machine.test.ts
```

Expected: FAIL — `applyStreakTransition` not exported, `assertUserTransition` not exported.

- [ ] **Step 1.3: Implement `streak.machine.ts`**

Replace entire contents of `server/core/state-machines/streak.machine.ts`:

```typescript
import { StreakStatus } from '@prisma/client'

const VALID_TRANSITIONS: Record<StreakStatus, StreakStatus[]> = {
  INACTIVE: [StreakStatus.ACTIVE],
  ACTIVE: [StreakStatus.ACTIVE, StreakStatus.BROKEN],
  BROKEN: [StreakStatus.ACTIVE],
}

export function isValidStreakTransition(from: StreakStatus, to: StreakStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

interface StreakCounterState {
  current: number
  best: number
  status: StreakStatus
}

export function applyStreakTransition(
  state: StreakCounterState,
  to: StreakStatus
): StreakCounterState {
  if (!isValidStreakTransition(state.status, to)) {
    throw new Error(`Invalid streak transition: ${state.status} → ${to}`)
  }

  if (to === StreakStatus.BROKEN) {
    return { ...state, status: StreakStatus.BROKEN }
  }

  // to === ACTIVE
  const next = state.status === StreakStatus.ACTIVE ? state.current + 1 : 1
  return {
    current: next,
    best: Math.max(state.best, next),
    status: StreakStatus.ACTIVE,
  }
}
```

- [ ] **Step 1.4: Implement `user.machine.ts`**

Replace entire contents of `server/core/state-machines/user.machine.ts`:

```typescript
import { UserActivityState } from '@prisma/client'

const VALID_TRANSITIONS: Record<UserActivityState, UserActivityState[]> = {
  ACTIVE: [UserActivityState.ACTIVE, UserActivityState.AT_RISK],
  AT_RISK: [UserActivityState.ACTIVE, UserActivityState.BROKEN],
  BROKEN: [UserActivityState.ACTIVE],
}

export function isValidUserTransition(
  from: UserActivityState,
  to: UserActivityState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertUserTransition(
  from: UserActivityState,
  to: UserActivityState
): void {
  if (!isValidUserTransition(from, to)) {
    throw new Error(`Invalid user activity transition: ${from} → ${to}`)
  }
}
```

- [ ] **Step 1.5: Run tests — verify they pass**

```bash
npm run test -- tests/unit/streaks/streak.machine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 1.6: Run full suite — verify no regressions**

```bash
npm run test
```

Expected: all 120+ tests still PASS.

- [ ] **Step 1.7: Commit**

```bash
git add server/core/state-machines/streak.machine.ts \
        server/core/state-machines/user.machine.ts \
        tests/unit/streaks/streak.machine.test.ts
git commit -m "$(cat <<'EOF'
feat(streaks): implement streak and user activity state machine

Replace stubs with full transition validation and counter logic.
applyStreakTransition handles INACTIVE/BROKEN→ACTIVE (reset to 1)
and ACTIVE→ACTIVE (increment). assertUserTransition enforces the
ACTIVE→AT_RISK→BROKEN→ACTIVE cycle.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Streak Types and Schema

**Files:**
- Modify: `server/modules/streaks/streaks.types.ts`
- Modify: `server/modules/streaks/streaks.schema.ts`

No separate test file — these are pure type definitions. TypeScript compiler is the test.

- [ ] **Step 2.1: Implement `streaks.types.ts`**

Replace entire contents:

```typescript
import type { StreakStatus, UserActivityState } from '@prisma/client'

export interface StreakState {
  id: string
  userId: string
  current: number
  best: number
  status: StreakStatus
  lastVerifiedAt: Date | null
  brokenAt: Date | null
}

// Returned by GET /api/streaks/me
export interface StreakResponse {
  current: number
  best: number
  status: StreakStatus
  lastVerifiedAt: string | null
}

// Returned by GET /api/streaks/:userId (less data — no lastVerifiedAt)
export interface PublicStreakResponse {
  current: number
  best: number
  status: StreakStatus
}

// Used by streakEvaluator — only ACTIVE streaks with non-null lastVerifiedAt
export interface StreakWithUserActivity {
  id: string
  userId: string
  current: number
  status: StreakStatus
  lastVerifiedAt: Date
  user: {
    activityState: UserActivityState
  }
}
```

- [ ] **Step 2.2: Implement `streaks.schema.ts`**

Replace entire contents:

```typescript
import { z } from 'zod'

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
})
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
npm run type-check 2>&1 | head -20
```

Expected: no new errors from these two files.

- [ ] **Step 2.4: Commit**

```bash
git add server/modules/streaks/streaks.types.ts \
        server/modules/streaks/streaks.schema.ts
git commit -m "$(cat <<'EOF'
feat(streaks): add streak types and Zod schema

StreakState mirrors the Prisma model. StreakResponse and
PublicStreakResponse are the API shapes. StreakWithUserActivity
is the evaluator's query result type with non-null lastVerifiedAt.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Streak Repository

**Files:**
- Modify: `server/modules/streaks/streaks.repo.ts`
- Create: `tests/unit/streaks/streaks.repo.test.ts`

- [ ] **Step 3.1: Write failing repo tests**

Create `tests/unit/streaks/streaks.repo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

const mockPrisma = {
  streak: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  post: {
    findUnique: vi.fn(),
  },
  event: {
    create: vi.fn(),
  },
}

vi.mock('../../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  getStreakByUserId,
  updateStreak,
  markStreakBroken,
  getActiveStreaksForEvaluation,
  updateUserActivityState,
  persistStreakEvent,
  getPostCreatedAt,
} from '../../server/modules/streaks/streaks.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getStreakByUserId', () => {
  it('returns streak when found', async () => {
    const streak = {
      id: 'streak-1',
      userId: 'user-1',
      current: 5,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt: new Date('2024-01-14T10:00:00Z'),
      brokenAt: null,
    }
    mockPrisma.streak.findUnique.mockResolvedValue(streak)

    const result = await getStreakByUserId('user-1')

    expect(result).toEqual(streak)
    expect(mockPrisma.streak.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        userId: true,
        current: true,
        best: true,
        status: true,
        lastVerifiedAt: true,
        brokenAt: true,
      },
    })
  })

  it('returns null when not found', async () => {
    mockPrisma.streak.findUnique.mockResolvedValue(null)
    const result = await getStreakByUserId('user-ghost')
    expect(result).toBeNull()
  })
})

describe('updateStreak', () => {
  it('updates all streak fields', async () => {
    mockPrisma.streak.update.mockResolvedValue({})
    const lastVerifiedAt = new Date('2024-01-15T10:00:00Z')

    await updateStreak('user-1', {
      current: 6,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt,
      brokenAt: null,
    })

    expect(mockPrisma.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { current: 6, best: 10, status: StreakStatus.ACTIVE, lastVerifiedAt, brokenAt: null },
    })
  })
})

describe('markStreakBroken', () => {
  it('sets status BROKEN and records brokenAt timestamp', async () => {
    mockPrisma.streak.update.mockResolvedValue({})
    const brokenAt = new Date('2024-01-15T11:00:00Z')

    await markStreakBroken('user-1', brokenAt)

    expect(mockPrisma.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { status: StreakStatus.BROKEN, brokenAt },
    })
  })
})

describe('getActiveStreaksForEvaluation', () => {
  it('queries ACTIVE streaks with non-null lastVerifiedAt and user activityState', async () => {
    const rows = [
      {
        id: 'streak-1',
        userId: 'user-1',
        current: 3,
        status: StreakStatus.ACTIVE,
        lastVerifiedAt: new Date('2024-01-14T10:00:00Z'),
        user: { activityState: UserActivityState.ACTIVE },
      },
    ]
    mockPrisma.streak.findMany.mockResolvedValue(rows)

    const result = await getActiveStreaksForEvaluation()

    expect(result).toEqual(rows)
    expect(mockPrisma.streak.findMany).toHaveBeenCalledWith({
      where: { status: StreakStatus.ACTIVE, lastVerifiedAt: { not: null } },
      select: {
        id: true,
        userId: true,
        current: true,
        status: true,
        lastVerifiedAt: true,
        user: { select: { activityState: true } },
      },
    })
  })
})

describe('updateUserActivityState', () => {
  it('updates user activityState field', async () => {
    mockPrisma.user.update.mockResolvedValue({})

    await updateUserActivityState('user-1', UserActivityState.AT_RISK)

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { activityState: UserActivityState.AT_RISK },
    })
  })
})

describe('persistStreakEvent', () => {
  it('inserts event row into the events table', async () => {
    mockPrisma.event.create.mockResolvedValue({ id: 'event-1' })

    await persistStreakEvent({
      type: 'STREAK_UPDATED',
      userId: 'user-1',
      payload: { current: 6, best: 10, status: 'ACTIVE' },
      source: 'streaks.service',
    })

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STREAK_UPDATED',
        userId: 'user-1',
        source: 'streaks.service',
        correlationId: null,
      }),
    })
  })

  it('passes correlationId when provided', async () => {
    mockPrisma.event.create.mockResolvedValue({ id: 'event-2' })

    await persistStreakEvent({
      type: 'STREAK_BROKEN',
      userId: 'user-1',
      payload: {},
      source: 'streak.evaluator',
      correlationId: 'corr-123',
    })

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ correlationId: 'corr-123' }),
    })
  })
})

describe('getPostCreatedAt', () => {
  it('returns post createdAt when post exists', async () => {
    const createdAt = new Date('2024-01-15T10:00:00Z')
    mockPrisma.post.findUnique.mockResolvedValue({ createdAt })

    const result = await getPostCreatedAt('post-1')

    expect(result).toEqual(createdAt)
    expect(mockPrisma.post.findUnique).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      select: { createdAt: true },
    })
  })

  it('returns null when post not found', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    const result = await getPostCreatedAt('ghost-post')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run tests — verify they fail**

```bash
npm run test -- tests/unit/streaks/streaks.repo.test.ts
```

Expected: FAIL — all functions not yet exported.

- [ ] **Step 3.3: Implement `streaks.repo.ts`**

Replace entire contents:

```typescript
import { StreakStatus, UserActivityState, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { StreakState, StreakWithUserActivity } from './streaks.types'

export async function getStreakByUserId(userId: string): Promise<StreakState | null> {
  return prisma.streak.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      current: true,
      best: true,
      status: true,
      lastVerifiedAt: true,
      brokenAt: true,
    },
  })
}

export async function updateStreak(
  userId: string,
  data: {
    current: number
    best: number
    status: StreakStatus
    lastVerifiedAt: Date
    brokenAt?: Date | null
  }
): Promise<void> {
  await prisma.streak.update({
    where: { userId },
    data,
  })
}

export async function markStreakBroken(userId: string, brokenAt: Date): Promise<void> {
  await prisma.streak.update({
    where: { userId },
    data: { status: StreakStatus.BROKEN, brokenAt },
  })
}

export async function getActiveStreaksForEvaluation(): Promise<StreakWithUserActivity[]> {
  const rows = await prisma.streak.findMany({
    where: { status: StreakStatus.ACTIVE, lastVerifiedAt: { not: null } },
    select: {
      id: true,
      userId: true,
      current: true,
      status: true,
      lastVerifiedAt: true,
      user: { select: { activityState: true } },
    },
  })
  return rows as unknown as StreakWithUserActivity[]
}

export async function updateUserActivityState(
  userId: string,
  state: UserActivityState
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { activityState: state },
  })
}

export async function persistStreakEvent(params: {
  type: string
  userId: string
  payload: Record<string, unknown>
  source: string
  correlationId?: string
}): Promise<void> {
  await prisma.event.create({
    data: {
      type: params.type,
      userId: params.userId,
      payload: params.payload as Prisma.InputJsonValue,
      source: params.source,
      correlationId: params.correlationId ?? null,
    },
  })
}

export async function getPostCreatedAt(postId: string): Promise<Date | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { createdAt: true },
  })
  return post?.createdAt ?? null
}
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
npm run test -- tests/unit/streaks/streaks.repo.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3.5: Run full suite**

```bash
npm run test
```

Expected: all tests still PASS.

- [ ] **Step 3.6: Commit**

```bash
git add server/modules/streaks/streaks.repo.ts \
        tests/unit/streaks/streaks.repo.test.ts
git commit -m "$(cat <<'EOF'
feat(streaks): implement streak repository

Seven Prisma query functions: getStreakByUserId, updateStreak,
markStreakBroken (evaluator only), getActiveStreaksForEvaluation,
updateUserActivityState, persistStreakEvent, getPostCreatedAt.
getPostCreatedAt is used by the service to get post.createdAt
so AI latency doesn't penalise the streak timestamp.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Streak Service — onWorkoutVerified

**Files:**
- Modify: `server/modules/streaks/streaks.service.ts`
- Create: `tests/unit/streaks/streaks.service.test.ts`

- [ ] **Step 4.1: Write failing service tests**

Create `tests/unit/streaks/streaks.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

vi.mock('../../server/modules/streaks/streaks.repo')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { onWorkoutVerified, getMyStreak, getPublicStreak } from '../../server/modules/streaks/streaks.service'
import * as repo from '../../server/modules/streaks/streaks.repo'

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
  vi.mocked(repo.updateUserActivityState).mockResolvedValue(undefined)
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
      expect.objectContaining({ type: 'STREAK_RECOVERED', userId: 'user-1' })
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

    expect(repo.updateUserActivityState).toHaveBeenCalledWith('user-1', UserActivityState.ACTIVE)
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
    })
  })

  it('returns null when streak record does not exist', async () => {
    vi.mocked(repo.getStreakByUserId).mockResolvedValue(null)
    const result = await getMyStreak('user-new')
    expect(result).toBeNull()
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
```

- [ ] **Step 4.2: Run tests — verify they fail**

```bash
npm run test -- tests/unit/streaks/streaks.service.test.ts
```

Expected: FAIL — functions not yet implemented.

- [ ] **Step 4.3: Implement `streaks.service.ts`**

Replace entire contents:

```typescript
import { StreakStatus, UserActivityState } from '@prisma/client'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import { applyStreakTransition } from '../../core/state-machines/streak.machine'
import {
  getStreakByUserId,
  updateStreak,
  updateUserActivityState,
  persistStreakEvent,
  getPostCreatedAt,
} from './streaks.repo'
import type { StreakResponse, PublicStreakResponse } from './streaks.types'

function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export async function onWorkoutVerified(params: {
  postId: string
  userId: string
}): Promise<void> {
  const { postId, userId } = params

  const postCreatedAt = await getPostCreatedAt(postId)
  if (!postCreatedAt) {
    logger.error('streaks.service: post not found for streak update', { postId })
    return
  }

  const streak = await getStreakByUserId(userId)
  if (!streak) {
    logger.error('streaks.service: streak record not found', { userId })
    return
  }

  // Idempotency: skip if this post is older than or equal to the last credited post
  if (streak.lastVerifiedAt && postCreatedAt <= streak.lastVerifiedAt) {
    logger.info('streaks.service: post already credited, skipping', { postId, userId })
    return
  }

  // Same UTC day guard: only one streak increment per calendar day
  if (streak.lastVerifiedAt && isSameUTCDay(postCreatedAt, streak.lastVerifiedAt)) {
    logger.info('streaks.service: already credited today, skipping', { userId })
    return
  }

  const previousStatus = streak.status
  const newState = applyStreakTransition(
    { current: streak.current, best: streak.best, status: streak.status },
    StreakStatus.ACTIVE
  )

  await updateStreak(userId, {
    current: newState.current,
    best: newState.best,
    status: StreakStatus.ACTIVE,
    lastVerifiedAt: postCreatedAt,
    brokenAt: null,
  })

  await updateUserActivityState(userId, UserActivityState.ACTIVE)

  const isRecovery =
    previousStatus === StreakStatus.BROKEN || previousStatus === StreakStatus.INACTIVE
  const eventType = isRecovery ? EventType.STREAK_RECOVERED : EventType.STREAK_UPDATED

  await persistStreakEvent({
    type: eventType,
    userId,
    payload: {
      current: newState.current,
      best: newState.best,
      status: StreakStatus.ACTIVE,
    },
    source: 'streaks.service',
  })

  logger.info('streaks.service: streak updated', {
    userId,
    current: newState.current,
    previousStatus,
    eventType,
  })
}

export async function getMyStreak(userId: string): Promise<StreakResponse | null> {
  const streak = await getStreakByUserId(userId)
  if (!streak) return null
  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
    lastVerifiedAt: streak.lastVerifiedAt?.toISOString() ?? null,
  }
}

export async function getPublicStreak(userId: string): Promise<PublicStreakResponse | null> {
  const streak = await getStreakByUserId(userId)
  if (!streak) return null
  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
  }
}
```

- [ ] **Step 4.4: Run tests — verify they pass**

```bash
npm run test -- tests/unit/streaks/streaks.service.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4.5: Run full suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 4.6: Commit**

```bash
git add server/modules/streaks/streaks.service.ts \
        tests/unit/streaks/streaks.service.test.ts
git commit -m "$(cat <<'EOF'
feat(streaks): implement streak service with onWorkoutVerified

onWorkoutVerified applies the streak state machine, guards against
same-UTC-day double increments and exact-duplicate events, sets
user activityState to ACTIVE, and emits STREAK_RECOVERED or
STREAK_UPDATED. Streak timestamp uses post.createdAt (not AI
processing time) to avoid AI latency penalising users.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire Streak Service into AI Classifier

**Files:**
- Modify: `server/workers/aiClassifier.ts` (additive only — 5 new lines)
- Modify: `tests/unit/ai.classifier.test.ts` (add mock for streaks.service)

- [ ] **Step 5.1: Add streak service mock to existing classifier test**

Open `tests/unit/ai.classifier.test.ts`. After the existing `vi.mock` calls at the top (before any imports), add:

```typescript
vi.mock('../../server/modules/streaks/streaks.service', () => ({
  onWorkoutVerified: vi.fn().mockResolvedValue(undefined),
}))
```

Add to the `beforeEach`:
```typescript
import * as streaksService from '../../server/modules/streaks/streaks.service'
// inside beforeEach:
vi.mocked(streaksService.onWorkoutVerified).mockResolvedValue(undefined)
```

Add this test inside `describe('processUploadedPost', ...)`:
```typescript
it('calls onWorkoutVerified after VERIFIED post', async () => {
  vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

  await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

  expect(streaksService.onWorkoutVerified).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' })
})

it('does not call onWorkoutVerified when post is REJECTED', async () => {
  vi.mocked(aiService.classifyImage).mockResolvedValue(REJECTED_RESULT)

  await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

  expect(streaksService.onWorkoutVerified).not.toHaveBeenCalled()
})
```

- [ ] **Step 5.2: Run classifier test — verify new tests fail**

```bash
npm run test -- tests/unit/ai.classifier.test.ts
```

Expected: new tests FAIL (onWorkoutVerified not yet called from aiClassifier.ts).

- [ ] **Step 5.3: Add streak hook to `aiClassifier.ts`**

At the top of `server/workers/aiClassifier.ts`, add this import after existing imports:

```typescript
import { onWorkoutVerified } from '../modules/streaks/streaks.service'
```

In the `if (decision === 'VERIFIED')` block, after the `persistClassificationEvent` try/catch for WORKOUT_VERIFIED, add:

```typescript
    // R3: Update streak synchronously — uses post.createdAt, not AI processing time
    try {
      await onWorkoutVerified({ postId, userId })
    } catch (e: unknown) {
      logger.error('Failed to update streak on WORKOUT_VERIFIED', { postId, error: String(e) })
    }
```

The complete `if (decision === 'VERIFIED')` block should look like:

```typescript
  if (decision === 'VERIFIED') {
    const workoutId = await markPostVerified(postId, result)
    try {
      await persistClassificationEvent({
        type: EventType.WORKOUT_VERIFIED,
        userId,
        payload: { postId, workoutId, type: result.type, confidence: result.confidence, modelVersion: result.modelVersion },
        source: 'ai.worker',
        correlationId,
      })
    } catch (e: unknown) {
      logger.error('Failed to persist WORKOUT_VERIFIED event', { postId, error: String(e) })
    }

    // R3: Update streak synchronously — uses post.createdAt, not AI processing time
    try {
      await onWorkoutVerified({ postId, userId })
    } catch (e: unknown) {
      logger.error('Failed to update streak on WORKOUT_VERIFIED', { postId, error: String(e) })
    }
  }
```

- [ ] **Step 5.4: Run all tests — verify all pass**

```bash
npm run test
```

Expected: all tests PASS including the two new classifier tests.

- [ ] **Step 5.5: Commit**

```bash
git add server/workers/aiClassifier.ts \
        tests/unit/ai.classifier.test.ts
git commit -m "$(cat <<'EOF'
feat(streaks): wire onWorkoutVerified into AI classifier (R3)

After a post is verified and the WORKOUT_VERIFIED event is persisted,
call the streak service synchronously. Failure is caught and logged
so a streak DB error doesn't unwind the already-committed post state.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Streak Evaluator Worker (Cron)

**Files:**
- Create: `server/workers/streakEvaluator.ts`
- Create: `tests/unit/streaks/streakEvaluator.test.ts`

- [ ] **Step 6.1: Write failing evaluator tests**

Create `tests/unit/streaks/streakEvaluator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

vi.mock('../../server/modules/streaks/streaks.repo')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { evaluateStreaks } from '../../server/workers/streakEvaluator'
import * as repo from '../../server/modules/streaks/streaks.repo'

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
  vi.mocked(repo.updateUserActivityState).mockResolvedValue(undefined)
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
    expect(repo.updateUserActivityState).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('marks user AT_RISK at 20h when activityState is ACTIVE', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(21, UserActivityState.ACTIVE),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 1, broken: 0 })
    expect(repo.updateUserActivityState).toHaveBeenCalledWith(`user-21`, UserActivityState.AT_RISK)
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
    expect(repo.updateUserActivityState).not.toHaveBeenCalled()
    expect(repo.persistStreakEvent).not.toHaveBeenCalled()
  })

  it('breaks streak at 24h (from ACTIVE activityState)', async () => {
    vi.mocked(repo.getActiveStreaksForEvaluation).mockResolvedValue([
      makeStreak(25, UserActivityState.ACTIVE),
    ])

    const result = await evaluateStreaks()

    expect(result).toEqual({ atRisk: 0, broken: 1 })
    expect(repo.markStreakBroken).toHaveBeenCalledWith(`user-25`, expect.any(Date))
    expect(repo.updateUserActivityState).toHaveBeenCalledWith(`user-25`, UserActivityState.BROKEN)
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
```

- [ ] **Step 6.2: Run tests — verify they fail**

```bash
npm run test -- tests/unit/streaks/streakEvaluator.test.ts
```

Expected: FAIL — `evaluateStreaks` not yet exported.

- [ ] **Step 6.3: Create `server/workers/streakEvaluator.ts`**

```typescript
import { UserActivityState } from '@prisma/client'
import { logger } from '../core/logger/index'
import { EventType } from '../core/events/index'
import {
  getActiveStreaksForEvaluation,
  markStreakBroken,
  updateUserActivityState,
  persistStreakEvent,
} from '../modules/streaks/streaks.repo'

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
      await updateUserActivityState(streak.userId, UserActivityState.BROKEN)
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
      // R5: 20h elapsed and user still ACTIVE — warn once
      await updateUserActivityState(streak.userId, UserActivityState.AT_RISK)
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
```

- [ ] **Step 6.4: Run tests — verify they pass**

```bash
npm run test -- tests/unit/streaks/streakEvaluator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6.5: Run full suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 6.6: Commit**

```bash
git add server/workers/streakEvaluator.ts \
        tests/unit/streaks/streakEvaluator.test.ts
git commit -m "$(cat <<'EOF'
feat(streaks): implement streak evaluator worker (R5 + R6)

evaluateStreaks() queries all ACTIVE streaks with non-null
lastVerifiedAt, marks users AT_RISK at 20h (once — idempotent
via activityState check), and breaks streaks at 24h. Emits
STREAK_AT_RISK and STREAK_BROKEN events for downstream consumers.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: API Routes and Controller

**Files:**
- Modify: `server/modules/streaks/streaks.controller.ts`
- Create: `app/web/app/api/streaks/me/route.ts`
- Create: `app/web/app/api/streaks/[userId]/route.ts`
- Create: `app/web/app/api/cron/streak-evaluator/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

No unit tests for controllers/routes in this codebase (they're thin — service logic is unit tested). TypeScript compilation and the full test suite are the verification.

- [ ] **Step 7.1: Implement `streaks.controller.ts`**

Replace entire contents:

```typescript
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import {
  isAppError,
  toErrorResponse,
  InternalError,
  NotFoundError,
} from '../../core/errors/AppError'
import { getMyStreak, getPublicStreak } from './streaks.service'

export async function handleGetMyStreak(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const streak = await getMyStreak(auth.userId)
    if (!streak) throw new NotFoundError('Streak')
    return NextResponse.json({ streak }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetPublicStreak(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const streak = await getPublicStreak(userId)
    if (!streak) throw new NotFoundError('Streak')
    return NextResponse.json({ streak }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
```

- [ ] **Step 7.2: Create `app/web/app/api/streaks/me/route.ts`**

```typescript
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { handleGetMyStreak } from '@/server/modules/streaks/streaks.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetMyStreak(request)
}
```

- [ ] **Step 7.3: Create `app/web/app/api/streaks/[userId]/route.ts`**

```typescript
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { handleGetPublicStreak } from '@/server/modules/streaks/streaks.controller'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params
  return handleGetPublicStreak(request, userId)
}
```

- [ ] **Step 7.4: Create cron endpoint `app/web/app/api/cron/streak-evaluator/route.ts`**

First create the directory:
```bash
mkdir -p app/web/app/api/cron/streak-evaluator
```

```typescript
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { evaluateStreaks } from '@/server/workers/streakEvaluator'
import { logger } from '@/server/core/logger/index'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await evaluateStreaks()
    logger.info('Streak evaluator cron completed', result)
    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (err) {
    logger.error('Streak evaluator cron failed', { error: String(err) })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

- [ ] **Step 7.5: Create `vercel.json`**

Create at the project root `/BeActive/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/streak-evaluator",
      "schedule": "0 * * * *"
    }
  ]
}
```

The `schedule: "0 * * * *"` fires at the top of every hour. Vercel sends an `Authorization: Bearer <CRON_SECRET>` header automatically when it calls cron endpoints — no extra setup needed beyond adding `CRON_SECRET` to Vercel environment variables.

- [ ] **Step 7.6: Add `CRON_SECRET` to `.env.example`**

Open `.env.example` and add:

```
# Cron job protection — Vercel sets this automatically in cron calls
# Generate with: openssl rand -hex 32
CRON_SECRET="your-cron-secret-here"
```

- [ ] **Step 7.7: Verify TypeScript compiles clean**

```bash
npm run type-check 2>&1 | head -30
```

Expected: no new TypeScript errors.

- [ ] **Step 7.8: Run full test suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 7.9: Commit**

```bash
git add server/modules/streaks/streaks.controller.ts \
        app/web/app/api/streaks/me/route.ts \
        "app/web/app/api/streaks/[userId]/route.ts" \
        app/web/app/api/cron/streak-evaluator/route.ts \
        vercel.json \
        .env.example
git commit -m "$(cat <<'EOF'
feat(streaks): add streak API routes and Vercel cron config

GET /api/streaks/me — authenticated user's streak (current, best,
status, lastVerifiedAt). GET /api/streaks/:userId — public streak
for friend profiles (no lastVerifiedAt). Hourly cron protected by
CRON_SECRET calls the evaluateStreaks worker.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Streak UI — Hook and Widget

**Files:**
- Create: `app/web/hooks/useStreak.ts`
- Create: `app/web/components/features/StreakWidget.tsx`
- Modify: `app/web/app/(main)/feed/page.tsx`

No unit tests for pure UI components. TypeScript compilation + visual inspection during `npm run dev`.

- [ ] **Step 8.1: Create `app/web/hooks/useStreak.ts`**

```typescript
'use client'
import { useQuery } from '@tanstack/react-query'

export interface StreakData {
  current: number
  best: number
  status: 'INACTIVE' | 'ACTIVE' | 'BROKEN'
  lastVerifiedAt: string | null
}

export function useStreak() {
  return useQuery<StreakData | null>({
    queryKey: ['streak', 'me'],
    queryFn: async (): Promise<StreakData | null> => {
      const res = await fetch('/api/streaks/me')
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to fetch streak: ${res.status}`)
      const { streak } = (await res.json()) as { streak: StreakData }
      return streak
    },
    staleTime: 30_000,
    retry: 1,
  })
}
```

- [ ] **Step 8.2: Create `app/web/components/features/StreakWidget.tsx`**

```tsx
import type { StreakData } from '@/hooks/useStreak'

interface StreakWidgetProps {
  streak: StreakData | null
  isLoading: boolean
}

const STATUS_CONFIG = {
  ACTIVE: {
    dot: 'bg-green-400',
    label: 'Active',
    text: 'text-green-700',
    bg: 'bg-green-50 border-green-100',
  },
  AT_RISK: {
    dot: 'bg-amber-400',
    label: 'At risk',
    text: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-100',
  },
  BROKEN: {
    dot: 'bg-red-400',
    label: 'Broken',
    text: 'text-red-700',
    bg: 'bg-red-50 border-red-100',
  },
  INACTIVE: {
    dot: 'bg-gray-300',
    label: 'No streak',
    text: 'text-gray-500',
    bg: 'bg-white border-gray-100',
  },
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-20" />
    )
  }

  const status = streak?.status ?? 'INACTIVE'
  const config = STATUS_CONFIG[status]
  const current = streak?.current ?? 0
  const best = streak?.best ?? 0

  return (
    <div className={`rounded-xl border p-4 ${config.bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-bold tabular-nums leading-none">{current}</p>
            <p className="text-xs text-gray-500 mt-0.5">day streak</p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden />
            {config.label}
          </div>
        </div>
        {best > 0 && (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{best}</p>
            <p className="text-xs text-gray-400">best</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 8.3: Update `app/web/app/(main)/feed/page.tsx`**

Replace entire contents:

```tsx
'use client'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { Button } from '@/components/ui/Button'
import { StreakWidget } from '@/components/features/StreakWidget'

export default function FeedPage() {
  const { user, isLoading: authLoading, signOut } = useAuth()
  const { data: streak, isLoading: streakLoading } = useStreak()

  if (authLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse h-40" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Your Feed</h1>
          {user && <p className="text-sm text-gray-500">Hi, @{user.username}</p>}
        </div>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <StreakWidget streak={streak ?? null} isLoading={streakLoading} />

      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400 text-sm">Feed coming in Slice 5.</p>
        <p className="text-gray-300 text-xs mt-1">Add friends to see their workouts.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.4: Verify TypeScript compiles**

```bash
npm run type-check 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 8.5: Start dev server and verify UI**

```bash
npm run dev
```

Open http://localhost:3000/feed in browser. Check:
- INACTIVE state: shows "0 day streak / No streak" (no best counter since best=0)
- After a verified workout: shows the current streak count with green "Active" indicator
- If AT_RISK: amber dot and label, amber tinted background
- If BROKEN: red dot and label, red tinted background
- Best streak shows in the right corner only when best > 0

- [ ] **Step 8.6: Commit**

```bash
git add app/web/hooks/useStreak.ts \
        app/web/components/features/StreakWidget.tsx \
        "app/web/app/(main)/feed/page.tsx"
git commit -m "$(cat <<'EOF'
feat(streaks): add StreakWidget and useStreak hook

Shows current streak count, best streak, and activity state
(INACTIVE/ACTIVE/AT_RISK/BROKEN) with color-coded status indicator
on the feed page. TanStack Query caches for 30s.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|-------------|-----------|
| INACTIVE → ACTIVE on first workout | Task 1 (machine) + Task 4 (service) |
| ACTIVE → ACTIVE (increment within 24h) | Task 1 + Task 4 |
| BROKEN → ACTIVE (reset to 1) | Task 1 + Task 4 |
| Same UTC day no double increment | Task 4 (isSameUTCDay guard) |
| post.createdAt used (not AI processedAt) | Task 3 (getPostCreatedAt) + Task 4 |
| 20h AT_RISK cron | Task 6 (evaluator) |
| 24h BROKEN cron | Task 6 (evaluator) |
| AT_RISK idempotency (one warning per cycle) | Task 6 (activityState check) |
| WORKOUT_VERIFIED → onWorkoutVerified | Task 5 (aiClassifier hook) |
| GET /api/streaks/me | Task 7 |
| GET /api/streaks/:userId | Task 7 |
| STREAK_UPDATED event emitted | Task 4 (service) |
| STREAK_RECOVERED event emitted | Task 4 (service) |
| STREAK_AT_RISK event emitted | Task 6 (evaluator) |
| STREAK_BROKEN event emitted | Task 6 (evaluator) |
| Cron endpoint protected | Task 7 (CRON_SECRET check) |
| Vercel hourly schedule | Task 7 (vercel.json) |
| Streak counter UI | Task 8 (StreakWidget) |
| Status indicator (active/at-risk/broken) | Task 8 (StreakWidget STATUS_CONFIG) |
| Feed page integration | Task 8 (feed/page.tsx) |

**No gaps found.**

**Placeholder scan:** No TODOs, no "implement later", no "add validation". All code blocks are complete.

**Type consistency:**
- `StreakWithUserActivity.lastVerifiedAt` is `Date` (not `Date | null`) — cast in repo, consumed as `Date` in evaluator. ✓
- `applyStreakTransition` input uses `{ current, best, status }` — matches service usage. ✓
- `persistStreakEvent` parameters identical across repo, service, and evaluator. ✓
- `updateStreak` requires `lastVerifiedAt: Date` (not nullable) — service always passes `postCreatedAt` which is a real `Date` after the null check. ✓
- `markStreakBroken` takes `(userId: string, brokenAt: Date)` — evaluator passes `new Date()`. ✓

---

## Final Verification

After all tasks complete:

```bash
npm run test
npm run type-check
```

Both must pass with zero errors before Slice 4 is considered DONE.

**Slice 4 definition of done:**
- [ ] Streak increments correctly on verified workout (Task 4 service tests)
- [ ] No double increment on same-day workout (Task 4 same-day guard test)
- [ ] AI latency doesn't penalise streak (Task 3 `getPostCreatedAt` + Task 4)
- [ ] AT_RISK fires at 20h, once per cycle (Task 6 evaluator tests)
- [ ] BROKEN fires at 24h (Task 6 evaluator tests)
- [ ] Recovery from BROKEN resets counter to 1, preserves best (Task 4 recovery test)
- [ ] GET /api/streaks/me returns current state (Task 7)
- [ ] GET /api/streaks/:userId returns public state (Task 7)
- [ ] All 4 streak events emitted correctly (Tasks 4, 6)
- [ ] Cron endpoint protected by CRON_SECRET (Task 7)
- [ ] Streak widget renders correctly for all 4 states (Task 8 visual check)
