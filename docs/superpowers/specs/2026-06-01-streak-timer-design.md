# Streak Timer — Design Spec

> **Date:** 2026-06-01
> **Status:** Approved
> **Slice:** 4 (Streak Engine) — UX enhancement

---

## 1. Problem

The current `StreakWidget` shows streak count and status (ACTIVE/BROKEN/INACTIVE) but gives no sense of urgency or time remaining. Users don't know if they have 20 hours or 2 hours left before their streak breaks. QA testing of AT_RISK and BROKEN transitions requires reading raw DB timestamps with no visual aid.

---

## 2. Solution

Extend the existing `StreakWidget` with a live countdown timer row and add a dev-only debug panel that makes streak state immediately observable during QA.

---

## 3. Visual Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Widget layout | Expanded StreakWidget (timer row below count) | Keeps streak info in one card, no new surface |
| Timer format | HH:MM:SS ticking clock | Precise, updates every second, maximises urgency |
| Debug panel style | Visual dashboard: 4 cards + timeline progress bar | Instant QA readability without needing Prisma Studio |

### Timer row states

| Status | Background | Text color | Left label | Right value |
|--------|-----------|-----------|-----------|-------------|
| ACTIVE | `bg-green-50` | `text-green-700` | "You're safe" | `HH:MM:SS` green |
| AT_RISK | `bg-amber-50` | `text-amber-700` | "Post now to save it" | `HH:MM:SS` amber |
| BROKEN | `bg-red-50` | `text-red-700` | "Start a new streak" | "Reset required" |
| INACTIVE | *(no timer row)* | — | — | — |

---

## 4. Architecture

### 4.1 Principle

All deadline computation happens **server-side in one place** (`streaks.service.ts`). The frontend receives absolute UTC timestamps and only counts down. No time logic in components.

### 4.2 Data Flow

```
streaks.service.getMyStreak()
  computes: nextDeadline = lastVerifiedAt + 24h
  computes: atRiskAt    = lastVerifiedAt + 20h
  returns both in API response

GET /api/streaks/me → { current, best, status, lastVerifiedAt, nextDeadline, atRiskAt }

useStreak (TanStack Query, staleTime 30s)
  → StreakData now includes nextDeadline + atRiskAt

useStreakTimer(nextDeadline)          ← NEW pure hook
  setInterval(1000) while mounted
  returns { hh, mm, ss, computedStatus }
  stops at zero, emits no server calls

StreakWidget
  calls useStreakTimer internally
  renders timer row

StreakDebugPanel                      ← NEW, dev-only
  reads same StreakData
  renders when NEXT_PUBLIC_STREAK_DEBUG=true
```

### 4.3 Computed Status Logic (frontend, `useStreakTimer`)

```
if nextDeadline === null → INACTIVE (no timer)
if now >= nextDeadline  → BROKEN
if now >= atRiskAt      → AT_RISK
else                    → ACTIVE
```

The frontend-computed status is **display-only** — it never writes to the database. The authoritative status is still the server's `streak.status` field, maintained by the cron evaluator. The computed status is used solely to drive timer row color/label before the next API poll catches up.

Note: `streak.status` from the DB is always `INACTIVE | ACTIVE | BROKEN` — AT_RISK is a `User.activityState`, not a streak field. `useStreakTimer` derives the AT_RISK display state client-side by comparing `now >= atRiskAt`. This is intentional — it gives the timer sub-minute responsiveness without waiting for the cron or a poll cycle.

---

## 5. File Map

| File | Type | Change |
|------|------|--------|
| `server/modules/streaks/streaks.service.ts` | Backend | Add `nextDeadline` and `atRiskAt` to `getMyStreak` return value |
| `app/web/hooks/useStreak.ts` | Frontend | Add `nextDeadline: string \| null` and `atRiskAt: string \| null` to `StreakData` |
| `app/web/hooks/useStreakTimer.ts` | **NEW** | Pure countdown hook — `setInterval(1000)`, returns `{ hh, mm, ss, computedStatus }` |
| `app/web/components/features/StreakWidget.tsx` | Frontend | Add timer row below existing count row |
| `app/web/components/features/StreakDebugPanel.tsx` | **NEW** | Dev-only panel: 4 stat cards + timeline progress bar |
| `app/web/app/(main)/feed/page.tsx` | Frontend | Mount `<StreakDebugPanel>` conditionally on `NEXT_PUBLIC_STREAK_DEBUG` |

**No new API routes. No DB schema changes. No Prisma migration required.**

---

## 6. API Contract Change

`GET /api/streaks/me` — extended response:

```typescript
{
  streak: {
    current: number
    best: number
    status: 'INACTIVE' | 'ACTIVE' | 'BROKEN'
    lastVerifiedAt: string | null        // existing
    nextDeadline: string | null          // NEW — ISO UTC, lastVerifiedAt + 24h
    atRiskAt: string | null              // NEW — ISO UTC, lastVerifiedAt + 20h
  }
}
```

Both new fields are `null` when `status === 'INACTIVE'` or `lastVerifiedAt === null`.

---

## 7. Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_STREAK_DEBUG` | `"true"` | Enables debug panel in browser. Set in `.env.local` only — never production. |

---

## 8. Debug Panel Spec (B-style)

Visible when `process.env.NEXT_PUBLIC_STREAK_DEBUG === 'true'`.

**Contents:**
- 4 stat cards in a 2×2 grid:
  - `lastVerifiedAt` — human-readable UTC time
  - `nextDeadline` — human-readable UTC time
  - `computedStatus` — ACTIVE / AT_RISK / BROKEN / INACTIVE
  - `atRiskAt` — human-readable UTC time
- Progress bar: filled proportionally to `(now - lastVerifiedAt) / 24h`
  - Green fill up to 83% (20h mark), amber fill from 83% to 100%
  - Tick mark at 83% labelled "AT_RISK"
  - Tick mark at 100% labelled "BREAK"
- Dark background (`bg-slate-900`), positioned below `StreakWidget` on feed page

**QA fast-forward workflow:**
```bash
# Simulate AT_RISK (21h elapsed)
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.streak.updateMany({where:{status:'ACTIVE'},data:{lastVerifiedAt:new Date(Date.now()-21*3600*1000)}}).then(r=>{console.log(r);p.\$disconnect()})
"
# Refresh /feed — debug panel timeline bar jumps past AT_RISK marker, widget turns amber

# Simulate BROKEN (25h elapsed) — change 21 to 25

# Restore — run qa-streak.mjs or upload a new workout
```

---

## 9. Constraints

- Timer row must not show for `INACTIVE` streak (no lastVerifiedAt to count from)
- `useStreakTimer` must clean up its interval on unmount (no memory leaks)
- `computedStatus` in the timer hook is display-only — never passed to any API call
- Debug panel must be completely absent from production builds (`NEXT_PUBLIC_STREAK_DEBUG` not set = no panel, no JS bundle overhead)
- No new DB columns — `nextDeadline` and `atRiskAt` are computed on read, not stored

---

## 10. Definition of Done

- [ ] `/api/streaks/me` returns `nextDeadline` and `atRiskAt`
- [ ] `useStreakTimer` counts down in real time, cleans up on unmount
- [ ] StreakWidget timer row shows correct color/label for all three active states
- [ ] INACTIVE streak shows no timer row
- [ ] After a VERIFIED workout, `queryClient.invalidateQueries(['streak','me'])` fires → timer resets to ~24h
- [ ] Debug panel appears only when `NEXT_PUBLIC_STREAK_DEBUG=true`
- [ ] Debug panel timeline bar moves correctly when DB timestamp is backdated
- [ ] `npm run test` still passes (172+ tests)
- [ ] `node qa-streak.mjs` still passes (8/8)
- [ ] No TypeScript errors (`npm run type-check`)
