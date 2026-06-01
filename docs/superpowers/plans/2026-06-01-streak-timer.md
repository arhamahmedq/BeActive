# Streak Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live HH:MM:SS countdown timer to the StreakWidget and a dev-only debug panel that makes AT_RISK/BROKEN state transitions immediately visible during QA.

**Architecture:** The backend extends `GET /api/streaks/me` to return two pre-computed UTC timestamps (`nextDeadline`, `atRiskAt`). The frontend receives these timestamps and counts down client-side using a `useStreakTimer` hook with `setInterval(1000)`. All deadline math lives in one place (`streaks.service.ts`); components contain zero time logic.

**Tech Stack:** TypeScript, Next.js App Router, TanStack Query, Tailwind CSS, Vitest (unit tests), Prisma (read-only in this feature — no schema changes)

---

## File Map

| File | Status | Role |
|------|--------|------|
| `server/modules/streaks/streaks.types.ts` | Modify | Add `nextDeadline` + `atRiskAt` to `StreakResponse` |
| `server/modules/streaks/streaks.service.ts` | Modify | Compute and return the two new fields in `getMyStreak` |
| `tests/unit/streaks/streaks.service.test.ts` | Modify | Cover new fields in existing `getMyStreak` tests |
| `app/web/hooks/useStreak.ts` | Modify | Add two new fields to `StreakData` type |
| `app/web/hooks/useStreakTimer.ts` | Create | Pure countdown hook + exported helpers for testing |
| `tests/unit/streaks/useStreakTimer.test.ts` | Create | Unit tests for exported pure functions |
| `app/web/components/features/StreakWidget.tsx` | Modify | Add timer row using `useStreakTimer` |
| `app/web/components/features/StreakDebugPanel.tsx` | Create | Dev-only dashboard with timeline bar |
| `app/web/app/(main)/feed/page.tsx` | Modify | Mount `StreakDebugPanel` when `NEXT_PUBLIC_STREAK_DEBUG=true` |

---

## Task 1: Extend backend — add `nextDeadline` + `atRiskAt` to streak response

**Files:**
- Modify: `server/modules/streaks/streaks.types.ts`
- Modify: `server/modules/streaks/streaks.service.ts`
- Modify: `tests/unit/streaks/streaks.service.test.ts`

- [ ] **Step 1.1: Add the two new fields to `StreakResponse` in `streaks.types.ts`**

Replace the existing `StreakResponse` interface (leave everything else in the file untouched):

```typescript
// Returned by GET /api/streaks/me
export interface StreakResponse {
  current: number
  best: number
  status: StreakStatus
  lastVerifiedAt: string | null
  nextDeadline: string | null   // lastVerifiedAt + 24h, null when INACTIVE
  atRiskAt: string | null       // lastVerifiedAt + 20h, null when INACTIVE
}
```

- [ ] **Step 1.2: Write the failing tests for `getMyStreak` — new fields**

Add these two test cases inside the existing `describe('getMyStreak', ...)` block in `tests/unit/streaks/streaks.service.test.ts`:

```typescript
it('returns nextDeadline = lastVerifiedAt + 24h for ACTIVE streak', async () => {
  const lva = new Date('2024-01-14T10:00:00Z')
  vi.mocked(repo.getStreakByUserId).mockResolvedValue({
    ...ACTIVE_STREAK,
    lastVerifiedAt: lva,
  })

  const result = await getMyStreak('user-1')

  expect(result?.nextDeadline).toBe('2024-01-15T10:00:00.000Z')
  expect(result?.atRiskAt).toBe('2024-01-14T06:00:00.000Z')
})

it('returns null nextDeadline and atRiskAt for INACTIVE streak', async () => {
  vi.mocked(repo.getStreakByUserId).mockResolvedValue(INACTIVE_STREAK)

  const result = await getMyStreak('user-1')

  expect(result?.nextDeadline).toBeNull()
  expect(result?.atRiskAt).toBeNull()
})
```

- [ ] **Step 1.3: Run new tests to verify they fail**

```bash
npm run test -- --reporter=verbose tests/unit/streaks/streaks.service.test.ts
```

Expected: the two new tests FAIL with `expect(received).toBe(expected)` — `nextDeadline` and `atRiskAt` are `undefined` because the service doesn't return them yet.

- [ ] **Step 1.4: Implement the deadline computation in `getMyStreak`**

Replace the existing `getMyStreak` function in `server/modules/streaks/streaks.service.ts`:

```typescript
export async function getMyStreak(userId: string): Promise<StreakResponse | null> {
  const streak = await getStreakByUserId(userId)
  if (!streak) return null

  const lastVerifiedAt = streak.lastVerifiedAt
  const nextDeadline = lastVerifiedAt
    ? new Date(lastVerifiedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null
  const atRiskAt = lastVerifiedAt
    ? new Date(lastVerifiedAt.getTime() + 20 * 60 * 60 * 1000).toISOString()
    : null

  return {
    current: streak.current,
    best: streak.best,
    status: streak.status,
    lastVerifiedAt: lastVerifiedAt?.toISOString() ?? null,
    nextDeadline,
    atRiskAt,
  }
}
```

- [ ] **Step 1.5: Run all streak service tests**

```bash
npm run test -- --reporter=verbose tests/unit/streaks/streaks.service.test.ts
```

Expected: all tests PASS (previously 4 tests, now 6).

- [ ] **Step 1.6: Run full suite to confirm no regressions**

```bash
npm run test
```

Expected: all 172+ tests PASS.

- [ ] **Step 1.7: Commit**

```bash
git add server/modules/streaks/streaks.types.ts server/modules/streaks/streaks.service.ts tests/unit/streaks/streaks.service.test.ts
git commit -m "feat(streaks): extend getMyStreak to return nextDeadline and atRiskAt"
```

---

## Task 2: Update frontend `StreakData` type

**Files:**
- Modify: `app/web/hooks/useStreak.ts`

- [ ] **Step 2.1: Add `nextDeadline` and `atRiskAt` to `StreakData`**

Replace the `StreakData` interface in `app/web/hooks/useStreak.ts` (the `queryFn` and `useQuery` call remain unchanged):

```typescript
export interface StreakData {
  current: number
  best: number
  status: 'INACTIVE' | 'ACTIVE' | 'BROKEN'
  lastVerifiedAt: string | null
  nextDeadline: string | null
  atRiskAt: string | null
}
```

- [ ] **Step 2.2: Type-check**

```bash
npm run type-check
```

Expected: no errors. The API already returns these fields (Task 1), so the hook will receive them automatically.

- [ ] **Step 2.3: Commit**

```bash
git add app/web/hooks/useStreak.ts
git commit -m "feat(streaks): add nextDeadline + atRiskAt to StreakData type"
```

---

## Task 3: Implement `useStreakTimer` hook (TDD)

**Files:**
- Create: `app/web/hooks/useStreakTimer.ts`
- Create: `tests/unit/streaks/useStreakTimer.test.ts`

The hook exports two pure helper functions (`computeTimerStatus`, `formatSeconds`) alongside the hook itself. We test the pure functions — they contain all the logic. The hook wires them to `setInterval`.

- [ ] **Step 3.1: Write the failing tests**

Create `tests/unit/streaks/useStreakTimer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeTimerStatus, formatSeconds } from '../../../app/web/hooks/useStreakTimer'

describe('computeTimerStatus', () => {
  it('returns INACTIVE when nextDeadline is null', () => {
    expect(computeTimerStatus(null, null, Date.now())).toBe('INACTIVE')
  })

  it('returns ACTIVE when now is well before atRiskAt', () => {
    const now = new Date('2024-01-15T10:00:00Z').getTime()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()   // 20h after last
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString() // 24h after last
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('ACTIVE')
  })

  it('returns AT_RISK when now is past atRiskAt but before nextDeadline', () => {
    const now = new Date('2024-01-16T08:00:00Z').getTime() // 22h elapsed
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('AT_RISK')
  })

  it('returns BROKEN when now is past nextDeadline', () => {
    const now = new Date('2024-01-16T11:00:00Z').getTime() // 25h elapsed
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('BROKEN')
  })

  it('returns BROKEN at the exact deadline millisecond', () => {
    const nextDeadline = new Date('2024-01-16T10:00:00Z').toISOString()
    const atRiskAt = new Date('2024-01-16T06:00:00Z').toISOString()
    const now = new Date('2024-01-16T10:00:00Z').getTime()
    expect(computeTimerStatus(nextDeadline, atRiskAt, now)).toBe('BROKEN')
  })
})

describe('formatSeconds', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatSeconds(0)).toEqual({ hh: '00', mm: '00', ss: '00' })
  })

  it('formats 3661 seconds as 01:01:01', () => {
    expect(formatSeconds(3661)).toEqual({ hh: '01', mm: '01', ss: '01' })
  })

  it('formats 86399 seconds (23:59:59)', () => {
    expect(formatSeconds(86399)).toEqual({ hh: '23', mm: '59', ss: '59' })
  })

  it('pads single-digit values with leading zeros', () => {
    expect(formatSeconds(65)).toEqual({ hh: '00', mm: '01', ss: '05' })
  })

  it('clamps negative input to 00:00:00', () => {
    expect(formatSeconds(-100)).toEqual({ hh: '00', mm: '00', ss: '00' })
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
npm run test -- --reporter=verbose tests/unit/streaks/useStreakTimer.test.ts
```

Expected: FAIL — `computeTimerStatus` and `formatSeconds` not found.

- [ ] **Step 3.3: Implement the hook**

Create `app/web/hooks/useStreakTimer.ts`:

```typescript
'use client'
import { useState, useEffect } from 'react'

export type TimerStatus = 'INACTIVE' | 'ACTIVE' | 'AT_RISK' | 'BROKEN'

export interface StreakTimerResult {
  hh: string
  mm: string
  ss: string
  computedStatus: TimerStatus
  totalSecondsLeft: number
}

export function computeTimerStatus(
  nextDeadline: string | null,
  atRiskAt: string | null,
  nowMs: number
): TimerStatus {
  if (!nextDeadline || !atRiskAt) return 'INACTIVE'
  if (nowMs >= new Date(nextDeadline).getTime()) return 'BROKEN'
  if (nowMs >= new Date(atRiskAt).getTime()) return 'AT_RISK'
  return 'ACTIVE'
}

export function formatSeconds(totalSeconds: number): { hh: string; mm: string; ss: string } {
  const s = Math.max(0, totalSeconds)
  return {
    hh: String(Math.floor(s / 3600)).padStart(2, '0'),
    mm: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    ss: String(s % 60).padStart(2, '0'),
  }
}

export function useStreakTimer(
  nextDeadline: string | null,
  atRiskAt: string | null
): StreakTimerResult {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!nextDeadline) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [nextDeadline])

  if (!nextDeadline || !atRiskAt) {
    return { hh: '00', mm: '00', ss: '00', computedStatus: 'INACTIVE', totalSecondsLeft: 0 }
  }

  const totalSecondsLeft = Math.max(
    0,
    Math.floor((new Date(nextDeadline).getTime() - nowMs) / 1000)
  )

  return {
    ...formatSeconds(totalSecondsLeft),
    computedStatus: computeTimerStatus(nextDeadline, atRiskAt, nowMs),
    totalSecondsLeft,
  }
}
```

- [ ] **Step 3.4: Run new tests**

```bash
npm run test -- --reporter=verbose tests/unit/streaks/useStreakTimer.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 3.5: Run full suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 3.6: Commit**

```bash
git add app/web/hooks/useStreakTimer.ts tests/unit/streaks/useStreakTimer.test.ts
git commit -m "feat(streaks): add useStreakTimer hook with pure helper functions"
```

---

## Task 4: Update `StreakWidget` with timer row

**Files:**
- Modify: `app/web/components/features/StreakWidget.tsx`

The timer row appears below the existing count row. INACTIVE streak = no timer row. The row uses `computedStatus` from `useStreakTimer` (not `streak.status`) to drive its color and label.

- [ ] **Step 4.1: Replace `StreakWidget.tsx` with the updated version**

```typescript
import { useStreakTimer } from '@/hooks/useStreakTimer'
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

const TIMER_ROW_CONFIG = {
  ACTIVE: {
    bg: 'bg-green-50',
    label: "You're safe",
    labelColor: 'text-green-700',
    valueColor: 'text-green-700',
  },
  AT_RISK: {
    bg: 'bg-amber-50',
    label: 'Post now to save it',
    labelColor: 'text-amber-700',
    valueColor: 'text-amber-700',
  },
  BROKEN: {
    bg: 'bg-red-50',
    label: 'Start a new streak',
    labelColor: 'text-red-700',
    valueColor: 'text-red-700',
  },
  INACTIVE: null,
}

function TimerRow({ nextDeadline, atRiskAt }: { nextDeadline: string | null; atRiskAt: string | null }) {
  const { hh, mm, ss, computedStatus } = useStreakTimer(nextDeadline, atRiskAt)
  const rowConfig = TIMER_ROW_CONFIG[computedStatus]
  if (!rowConfig) return null

  return (
    <div className={`rounded-lg px-3 py-2 flex items-center justify-between mt-3 ${rowConfig.bg}`}>
      <span className={`text-xs font-medium ${rowConfig.labelColor}`}>{rowConfig.label}</span>
      {computedStatus === 'BROKEN' ? (
        <span className={`text-xs font-semibold ${rowConfig.valueColor}`}>Reset required</span>
      ) : (
        <span className={`text-sm font-bold tabular-nums ${rowConfig.valueColor}`}>
          {hh}:{mm}:{ss}
        </span>
      )}
    </div>
  )
}

export function StreakWidget({ streak, isLoading }: StreakWidgetProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-20" />
    )
  }

  const status = streak?.status ?? 'INACTIVE'
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
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
      <TimerRow
        nextDeadline={streak?.nextDeadline ?? null}
        atRiskAt={streak?.atRiskAt ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 4.2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4.3: Run full test suite**

```bash
npm run test
```

Expected: all tests PASS (StreakWidget has no unit tests — visual verification is in Task 6).

- [ ] **Step 4.4: Commit**

```bash
git add app/web/components/features/StreakWidget.tsx
git commit -m "feat(streaks): add live HH:MM:SS countdown timer row to StreakWidget"
```

---

## Task 5: Implement `StreakDebugPanel`

**Files:**
- Create: `app/web/components/features/StreakDebugPanel.tsx`

Visible only when `process.env.NEXT_PUBLIC_STREAK_DEBUG === 'true'`. Shows 4 stat cards + progress bar timeline.

- [ ] **Step 5.1: Create `StreakDebugPanel.tsx`**

```typescript
'use client'
import { useStreakTimer } from '@/hooks/useStreakTimer'
import type { StreakData } from '@/hooks/useStreak'

interface StreakDebugPanelProps {
  streak: StreakData | null
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toUTCString().slice(0, 25)} UTC`
}

function DebugCard({ label, value, color = 'text-slate-300' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xs font-mono font-semibold ${color} break-all`}>{value}</p>
    </div>
  )
}

export function StreakDebugPanel({ streak }: StreakDebugPanelProps) {
  const { computedStatus } = useStreakTimer(
    streak?.nextDeadline ?? null,
    streak?.atRiskAt ?? null
  )

  const lastVerifiedAt = streak?.lastVerifiedAt ?? null
  const nextDeadline = streak?.nextDeadline ?? null
  const atRiskAt = streak?.atRiskAt ?? null

  // Progress within 24h window: 0 = just verified, 1 = deadline
  const progressPct = (() => {
    if (!lastVerifiedAt || !nextDeadline) return 0
    const start = new Date(lastVerifiedAt).getTime()
    const end = new Date(nextDeadline).getTime()
    const now = Date.now()
    return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
  })()

  const statusColor: Record<string, string> = {
    ACTIVE: 'text-green-400',
    AT_RISK: 'text-amber-400',
    BROKEN: 'text-red-400',
    INACTIVE: 'text-slate-400',
  }

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
      <p className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-3">
        streak debug
      </p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <DebugCard label="lastVerifiedAt" value={fmt(lastVerifiedAt)} color="text-green-400" />
        <DebugCard label="nextDeadline" value={fmt(nextDeadline)} color="text-sky-400" />
        <DebugCard
          label="computedStatus"
          value={computedStatus}
          color={statusColor[computedStatus] ?? 'text-slate-300'}
        />
        <DebugCard label="atRiskAt" value={fmt(atRiskAt)} color="text-amber-400" />
      </div>

      {/* Timeline bar */}
      <div>
        <p className="text-xs text-slate-500 mb-2">24h window</p>
        <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${
              progressPct >= 83 ? 'bg-amber-400' : 'bg-green-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {/* AT_RISK marker at 83% */}
        <div className="relative h-4">
          <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '83%' }}>
            <div className="w-px h-2 bg-amber-400" />
          </div>
          <div className="absolute top-0 h-full flex flex-col items-center" style={{ left: '100%', transform: 'translateX(-100%)' }}>
            <div className="w-px h-2 bg-red-400" />
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-slate-600 mt-0.5">
          <span>T+0</span>
          <span className="text-amber-500" style={{ marginLeft: '72%' }}>AT_RISK</span>
          <span className="text-red-500">BREAK</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 5.3: Commit**

```bash
git add app/web/components/features/StreakDebugPanel.tsx
git commit -m "feat(streaks): add StreakDebugPanel dev overlay with timeline bar"
```

---

## Task 6: Wire feed page + browser verification

**Files:**
- Modify: `app/web/app/(main)/feed/page.tsx`

- [ ] **Step 6.1: Add `StreakDebugPanel` to feed page**

Replace the contents of `app/web/app/(main)/feed/page.tsx`:

```typescript
'use client'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { Button } from '@/components/ui/Button'
import { StreakWidget } from '@/components/features/StreakWidget'
import { StreakDebugPanel } from '@/components/features/StreakDebugPanel'

const DEBUG = process.env.NEXT_PUBLIC_STREAK_DEBUG === 'true'

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

      {DEBUG && <StreakDebugPanel streak={streak ?? null} />}

      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400 text-sm">Feed coming in Slice 5.</p>
        <p className="text-gray-300 text-xs mt-1">Add friends to see their workouts.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2: Run full test suite**

```bash
npm run test
```

Expected: all tests PASS.

- [ ] **Step 6.3: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 6.4: Start dev server and verify in browser using Playwright**

In a separate terminal:
```bash
npm run dev
```

Then verify with Playwright (Claude will do this using `mcp__plugin_playwright_playwright__browser_*` tools):

1. Navigate to `http://localhost:3000/feed`
2. Confirm `StreakWidget` renders without errors
3. Confirm timer row is absent for INACTIVE streak (new user) OR shows green `HH:MM:SS` for ACTIVE streak
4. Set `NEXT_PUBLIC_STREAK_DEBUG=true` in `.env.local`, restart dev server, reload — confirm `StreakDebugPanel` appears below the widget
5. Run the AT_RISK simulation command and reload — confirm widget turns amber and label changes to "Post now to save it"

```bash
# Add to .env.local:
echo "NEXT_PUBLIC_STREAK_DEBUG=true" >> app/web/.env.local
```

```bash
# Simulate AT_RISK (requires an ACTIVE streak — run qa-streak.mjs first if needed,
# then immediately run this before the cleanup):
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.streak.updateMany({
  where:{status:'ACTIVE'},
  data:{lastVerifiedAt:new Date(Date.now()-21*60*60*1000)}
}).then(r=>{console.log('updated:',r.count);p.\$disconnect()})
"
```

- [ ] **Step 6.5: Commit**

```bash
git add "app/web/app/(main)/feed/page.tsx"
git commit -m "feat(streaks): wire StreakDebugPanel to feed page behind NEXT_PUBLIC_STREAK_DEBUG"
```

- [ ] **Step 6.6: Run `qa-streak.mjs` to confirm no regressions**

```bash
node --env-file=app/web/.env.local qa-streak.mjs
```

Expected: 8/8 PASS (all streak engine tests unaffected).

- [ ] **Step 6.7: Final commit — update CLAUDE.md**

Add `NEXT_PUBLIC_STREAK_DEBUG` to the environment variables section of `CLAUDE.md` (section 8), then:

```bash
git add CLAUDE.md
git commit -m "docs: add NEXT_PUBLIC_STREAK_DEBUG to env vars reference"
```

---

## Self-Review

**Spec coverage check:**
- [x] §3 Timer row states (ACTIVE/AT_RISK/BROKEN/INACTIVE) → Task 4 `TIMER_ROW_CONFIG`
- [x] §4.1 All time logic server-side → Task 1 computes in `getMyStreak`; frontend only counts down
- [x] §4.3 `computedStatus` logic → Task 3 `computeTimerStatus` with full test coverage
- [x] §6 API contract (nextDeadline + atRiskAt) → Task 1
- [x] §7 `NEXT_PUBLIC_STREAK_DEBUG` env var → Tasks 5 + 6
- [x] §8 Debug panel B-style (4 cards + timeline bar) → Task 5
- [x] §9 No timer row for INACTIVE → Task 4 `TIMER_ROW_CONFIG.INACTIVE = null`
- [x] §9 Interval cleanup on unmount → Task 3 `return () => clearInterval(id)`
- [x] §9 No new DB columns → confirmed across all tasks
- [x] §10 DoD: all criteria covered across Tasks 1–6

**No placeholders found. Types consistent across all tasks.**
