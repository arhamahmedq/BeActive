# STREAK_ENGINE_V2.md — BeActive Calendar-Day Streak Architecture

> **Status:** APPROVED (2026-06-01) — design only, pending phased implementation.
> **Supersedes:** the rolling-24h model in `STREAK_ENGINE.md` (kept for reference until migration Phase 7 completes).
> **Owner:** streaks module.
> **Rule:** `architecture.md` wins contradictions; this doc is the streak v2 source of truth.

---

## 0. THE ONE IDEA

> **The streak is not stored state. It is a pure function of three inputs: the completion ledger, the user's timezone, and the current instant.** Everything persisted (`currentStreak`, `bestStreak`, `status`) is a recomputable cache that is never trusted as authoritative.

The rolling-24h model stored a *moving deadline* (`lastVerifiedAt + 24h`) and required UI, cache, cron, and account-switch to stay synchronized against a continuously-changing target. Calendar days replace "synchronize against a moving deadline" with "recompute a pure function over discrete dates."

**Honest caveat:** calendar days do **not** remove timezone handling — they make it central. A rolling window is timezone-independent (UTC math); "their local calendar day" *requires* each user's timezone to know what day it is. We trade countdown-synchronization complexity for timezone-resolution complexity. That trade is correct for a habit app, but Section 5 (Timezone) is now the highest-risk part of the system.

---

## 1. PRODUCT RATIONALE

- **Fixed mental model:** "Post once before midnight," identical every day, independent of yesterday's post time. Rolling windows punish consistency (a 7am poster who slips to 9am shortens their next effective window).
- **Forgiving of life:** 7am or 11pm both count for "today."
- **Discrete & cacheable:** the unit of truth is a *date* (integer-comparable), not an *instant*.
- **Industry alignment:** Duolingo, Apple Fitness, BeReal all use local calendar day. Snapchat's rolling hourglass is the model users call stressful; GitHub's UTC day is the canonical timezone mistake. We copy Duolingo; we avoid both anti-patterns.

---

## 2. DOMAIN MODEL

```
┌──────────────────────────────────────────────┐
│  DailyCompletion  (AUTHORITATIVE, append-only) │
│  UNIQUE(userId, localDate)                      │
└───────────────────────┬────────────────────────┘
                        │  recomputeStreak() — pure
                        ▼
┌──────────────────────────────────────────────┐
│  Streak  (PROJECTION / cache)                  │
│  currentStreak, bestStreak, lastVerifiedDate,  │
│  status ∈ {INACTIVE, ACTIVE, BROKEN}           │
└───────────────────────┬────────────────────────┘
                        │  derive(status, completedToday, localHour)
                        ▼
┌──────────────────────────────────────────────┐
│  Display State  (NEVER persisted)              │
│  COMPLETED_TODAY | PENDING | AT_RISK | BROKEN  │
└──────────────────────────────────────────────┘
```

- **DailyCompletion** — immutable fact: user U completed on local date D. One per user per local date. Source of truth.
- **Streak** — denormalized cache derived entirely from the ledger. Holds nothing authoritative; divergence is always resolved in favor of the ledger.
- **Display state** — derived, never stored. **Retires the dual-state-machine smell** where `User.activityState` and `Streak.status` overlapped and could diverge.

---

## 3. DATABASE DESIGN

### 3.1 `DailyCompletion` (NEW) — decision: create it

Justification: (1) `UNIQUE(userId, localDate)` makes "one per day" a DB invariant → free idempotency; (2) recomputability kills the "missed event = permanent corruption" failure class; (3) enables late-verification healing; (4) powers calendar-heatmap UI + retention analytics with no future tables.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | PK |
| `userId` | string FK→User (cascade) | |
| `localDate` | **`DATE`** (no time) | calendar date in user's tz at post creation |
| `postId` | string FK→Post (no cascade) | the verified post that satisfied the day |
| `timezone` | string (IANA) | tz used to compute `localDate`, stored for audit so a later tz change can't rewrite history |
| `createdAt` | timestamptz | when recorded |

Constraints/indexes: `UNIQUE(userId, localDate)`; `INDEX(userId, localDate DESC)`.

### 3.2 `Streak` (MODIFIED)

- **NEW** `lastVerifiedDate DATE` (replaces `lastVerifiedAt: DateTime` for streak logic).
- Keep `current`/`best`/`status`/`brokenAt`. `status` is now a *projection* — only ever set to the recomputed value.
- **Deprecate** `lastVerifiedAt`; **delete** any API-computed `nextDeadline`/`atRiskAt`.

### 3.3 `User` (MODIFIED)

- `timezone` — enforce **IANA** format (`America/New_York`, never `+08:00`). Validate at onboarding.
- `activityState` — stop using for streaks; drop after migration.

### 3.4 Deliberately NOT added

No `deadline`/`expiresAt`/timer column. The absence of a stored deadline is the point.

---

## 4. STATE MACHINE

Durable (persisted on `Streak.status`): `INACTIVE → ACTIVE ⇄ BROKEN`. `AT_RISK` is **derived**, not persisted.

| State | Entry | Exit | Meaning |
|---|---|---|---|
| INACTIVE | new user, no completions | first completion → ACTIVE | never started |
| ACTIVE | a completion exists, no full local day missed since `lastVerifiedDate` | miss a full local day → BROKEN | alive |
| BROKEN | `currentLocalDate > lastVerifiedDate + 1` | new completion → ACTIVE (reset to 1) | lost |

Derived display tier via `derive(status, completedToday, localHour)`:

| Display | Condition |
|---|---|
| COMPLETED_TODAY | ACTIVE + completion exists for today |
| PENDING_TODAY | ACTIVE + none today + `localHour < EVENING` |
| AT_RISK | ACTIVE + none today + `localHour ≥ EVENING` |
| BROKEN | status = BROKEN |
| INACTIVE | status = INACTIVE |

Invalid (rejected + logged): `INACTIVE→BROKEN`; `BROKEN→ACTIVE` without a completion; any status set not backed by a recompute.

---

## 5. TIMEZONE STRATEGY (highest risk)

**Core rule:** `localDate = calendar date of (instant) rendered in the user's IANA timezone`. Never from a stored UTC offset (offsets break on DST).

- Store `User.timezone` as IANA; resolve dates with a vetted lib (Luxon / `date-fns-tz` / `Temporal`).
- At verification: `completion.localDate = zonedDate(post.createdAt, user.timezone)`; store the tz on the row.
- "Today": `zonedDate(now, user.timezone)`.
- **Travel:** streak follows timezone-of-record at evaluation time; past completions keep the tz they were earned in (immutable history).
- **Relocation:** changing tz never recomputes past completions; only future "today" uses the new tz.
- **DST:** handled for free — at *date* granularity an IANA zone always yields exactly one calendar date, regardless of 23h/25h days. This is a structural advantage over rolling windows.
- **Tie-break bias (production-safe):** *Never break a streak the user could have kept.* Break finalization carries a small grace buffer past local midnight to absorb in-flight AI verification and clock skew.

Regional: Singapore (`Asia/Singapore`, no DST), US (`America/*`), Europe (`Europe/*`), Australia (`Australia/Sydney`) — all handled by IANA with **zero region-specific code**.

---

## 6. DAILY EVALUATION ENGINE

**Pure function:** `recomputeStreak(ledgerRows, userTz, now) → { currentStreak, bestStreak, lastVerifiedDate, status }`. The only place streak math lives; both verification and cron call it; QA tests it with injected dates.

Let `D = lastVerifiedDate`, `T = currentLocalDate(user.tz)`:

| Situation | Rule |
|---|---|
| Increment | new completion `localDate == D + 1` → `currentStreak += 1` |
| Same-day repeat | new completion `localDate == D` → no-op (UNIQUE blocks it) |
| Reset | new completion `localDate > D + 1` → `currentStreak = 1` |
| Survive | `T == D` or `T == D + 1` → stays ACTIVE |
| Break | `T > D + 1` → BROKEN (a full local day passed) |

**Explicit edge cases:**

| Scenario | Behavior |
|---|---|
| Upload 11:59 PM | `localDate` = that day (uses `post.createdAt` in user tz) |
| Upload 12:01 AM | `localDate` = the new day |
| Multiple uploads same day | first verified inserts row; rest hit UNIQUE → no-op |
| AI verify crosses midnight | dated by `post.createdAt`, not verify time → counts for prior day; recompute heals any premature break |
| AI fails | no completion; normal break rules apply; manual-review path unchanged |

**Late-verification healing:** status is a projection — a late completion that fills a gap flips status back to ACTIVE on next recompute, no special "un-break" code. Break *notifications* are gated behind the grace buffer to avoid premature "broken" alerts.

**Eager vs lazy — hybrid:** reads always recompute (or trust a projection written by a recompute) — the read path never depends on the cron. A lightweight hourly cron exists only to (a) finalize broken streaks for analytics and (b) send AT_RISK/BROKEN notifications. The cron is off the correctness critical path.

---

## 7. EVENT ARCHITECTURE

| Event | Owner | Authoritative? | Purpose |
|---|---|---|---|
| `WORKOUT_VERIFIED` | ai.worker | trigger | only thing that can create a completion |
| `DAILY_COMPLETION_RECORDED` | streaks.service | **fact** | NEW — emitted when a ledger row is created |
| `STREAK_UPDATED` | streaks.service | projection notice | payload `{reason: STARTED\|CONTINUED\|RESET, currentStreak, bestStreak}` (collapses INCREMENTED/RESET) |
| `STREAK_BROKEN` | streak evaluator | projection notice | on finalized break |
| `STREAK_AT_RISK` | streak evaluator | notification only | idempotent per `(userId, localDate)` |

**Critical wiring (carried from prior incident):** `WORKOUT_VERIFIED → record completion → recompute` is a must-happen invariant and stays a **direct, awaited call** — not a bus subscription. The bus carries best-effort fan-out only (`DAILY_COMPLETION_RECORDED` → notifications/feed).

**Idempotency:** master key `DailyCompletion UNIQUE(userId, localDate)`; recompute idempotent by construction; notifications idempotent per `(userId, type, localDate)`.

---

## 8. UI / UX

| State | Headline | Sub | Color | Icon |
|---|---|---|---|---|
| Completed today | `🔥 {n}-day streak` | "Locked in for today." | Green | Solid flame |
| Pending | `🔥 {n}-day streak` | "You haven't logged today's workout." | Slate | Outline flame |
| At risk | `🔥 {n}-day streak` | "Streak at risk — today's almost over." | Amber | Pulsing flame |
| Broken | `Streak ended` | "You were on {best}. Start a new one today." | Red→neutral | Ember |
| Inactive | `Start your streak` | "Post your first workout today." | Slate | Spark |

**No timer digits.** The number shown is the stable streak count. Day-progressive urgency is computed client-side from `(completedToday, localHour)` in the user's tz — a single re-render at tier boundaries / on focus, replacing the per-second `setInterval`.

Copy principles: lead with the asset (`{n}-day streak`) for loss-aversion; escalate tone not number; on break, name the loss. Never imply a break on a fetch error (show last-known greyed).

---

## 9. QA STRATEGY

Time becomes an injectable input: the engine takes `(ledger, tz, now)`.

| Layer | What |
|---|---|
| Unit | `recomputeStreak` (consecutive, gap, reset); `derive()` tiers; local-date resolution incl. DST |
| Integration | verify→completion→recompute; idempotency; late-verify healing |
| E2E | upload→verify→"Completed today" |
| Timezone | same UTC instant, different tz → different local dates |

QA matrix (abridged): first workout; consecutive day; same-day repeat; skip a day; 11:59 PM; 12:01 AM; verify-crosses-midnight; late-verify heals; DST spring-forward; DST fall-back; two tz users same instant; account switch; tz change mid-streak.

**Founder-friendly:** a debug affordance to set a simulated "today" and insert/delete ledger rows, then read the recomputed streak instantly — no wall-clock waiting.

---

## 10. MIGRATION PLAN

**Principle:** additive, ledger-first, shadow-validated, reversible.

Remove (eventually): `useStreakTimer` countdown; `nextDeadline`/`atRiskAt` API fields; 20h/24h thresholds; `isSameUTCDay` guard; `Streak.lastVerifiedAt` reliance; `User.activityState` for streaks; the 24h debug progress bar.

Preserve: event log; upload→post→AI pipeline; the direct-call streak wiring; `queryClient.clear()` on sign-out; `current`/`best` values.

DB migrations: add `DailyCompletion`; add `Streak.lastVerifiedDate`; backfill ledger from VERIFIED posts (date via user IANA tz, deduped); recompute every Streak; parity report; later drop `lastVerifiedAt` + retire `activityState`.

No breakage: backfill carries counts over; **shadow mode** (compute new + old, serve old, log divergence) until divergence ≈ 0; grace bias at cutover. **Pre-req gate:** every user must have a valid IANA timezone — the riskiest dependency.

---

## 11. IMPLEMENTATION ROADMAP

| Phase | Objective | Risk | DoD |
|---|---|---|---|
| 0. TZ readiness | every user has valid IANA tz; onboarding enforces | **High** | audit: 0 invalid tz |
| 1. Ledger + pure engine | `DailyCompletion` + `recomputeStreak` (no wiring) | Low | pure fn passes full matrix |
| 2. Write path | verify → insert completion → recompute (direct call) | Medium | new verifies create completions + correct projection |
| 3. Backfill + shadow | backfill ledger; run new engine in shadow | **High** | divergence ≈ 0 |
| 4. Read cutover | API serves projection; remove deadline fields | Medium | API returns v2 shape |
| 5. UI swap | day-progressive urgency; delete `useStreakTimer` | Low | no timers; tiers correct |
| 6. Cron repurpose | cron = notifications + break finalization only | Medium | cron off correctness path |
| 7. Cleanup | drop `lastVerifiedAt`, retire `activityState`, delete rolling code | Low | full suite green |

Sequence: 0 → 1 → 2 → 3(shadow) → 4 → 5 → 6 → 7. Phases 0 and 3 are the high-risk gates — do not pass either without a clean report.

---

## 12. BIGGEST RISKS

1. **Timezone data quality (highest)** — wrong/missing IANA tz mis-dates completions. → Phase 0 gate, onboarding enforcement, audit.
2. **Backfill correctness** — historical posts dated in the then-valid tz. → shadow parity report.
3. **Late-verify / midnight boundary** — → ledger healing + grace buffer.
4. **Calendar days concentrate tz complexity** — don't under-resource Section 5.

A wrongly-broken streak is the single most damaging bug this app can ship, and it almost always traces to a timezone — never to the counting. Fund timezone correctness accordingly.
