# STATE_MACHINE_REGISTRY.md — BeActive State Machines v2.0

> **Purpose:** Formal definitions of every state machine. States are truth. Transitions are law.

---

## PRINCIPLES

1. **Only events trigger transitions** — no direct state manipulation
2. **Invalid transitions are rejected and logged** — never silently ignored
3. **All transitions are persisted in the events table** — full audit trail
4. **State is always derivable from event history** — replayable
5. **Rules never modify state directly** — rules *request* transitions, machines *validate* them

---

## MACHINE 1: USER ACTIVITY STATE

> ⚠️ **SUPERSEDED (2026-06-01)** by the calendar-day redesign in `STREAK_ENGINE_V2.md`.
> In v2 this machine is **retired**: `users.activityState` is no longer used for streak
> logic. The single durable lifecycle lives on `streaks.status` (Machine 3 v2), and
> `AT_RISK` becomes a *derived display tier* (from `completedToday` + local time-of-day),
> not a persisted state. The column is kept through migration and dropped in Phase 7.
> The definition below describes the v1 rolling-24h system, retained for shadow-migration
> reference only.

**Owner:** streaks module
**DB field:** `users.activityState`
**Enum:** `UserActivityState { ACTIVE, AT_RISK, BROKEN }`

### States

| State | Meaning | Visual |
|-------|---------|--------|
| ACTIVE | Streak healthy, posted workout within 20h | 🟢 Green flame |
| AT_RISK | 20-24h since last workout, warning sent | 🟡 Yellow flame |
| BROKEN | 24h+ since last workout, streak broken | 🔴 No flame |

### Transitions

| From | To | Trigger | Event Emitted |
|------|----|---------|---------------|
| ACTIVE | AT_RISK | Cron: 20h since lastVerifiedAt | STREAK_AT_RISK |
| AT_RISK | BROKEN | Cron: 24h since lastVerifiedAt | STREAK_BROKEN |
| AT_RISK | ACTIVE | WORKOUT_VERIFIED received | STREAK_RECOVERED |
| BROKEN | ACTIVE | WORKOUT_VERIFIED received (new streak starts) | STREAK_RECOVERED |
| ACTIVE | ACTIVE | WORKOUT_VERIFIED (streak increments) | STREAK_UPDATED |

### Invalid Transitions (Rejected + Logged)

| From | To | Why Invalid |
|------|----|-------------|
| BROKEN | AT_RISK | Cannot go backwards without workout |
| AT_RISK | AT_RISK | No self-transition without triggering event |
| Any | Any | Direct DB UPDATE without going through machine |

### Implementation Notes
- User starts as ACTIVE with streak INACTIVE (no workouts yet)
- AT_RISK is a *warning* state — user still has time
- BROKEN resets streak counter but preserves `best` value

---

## MACHINE 2: WORKOUT VERIFICATION

**Owner:** workouts module + AI worker
**DB field:** `posts.status`
**Enum:** `PostStatus { PENDING, VERIFIED, REJECTED }`

### States

| State | Meaning |
|-------|---------|
| PENDING | Uploaded, awaiting AI classification |
| VERIFIED | AI confirmed as workout (confidence ≥ 0.70) |
| REJECTED | AI rejected (confidence < 0.70) |

### Transitions

| From | To | Trigger | Event Emitted |
|------|----|---------|---------------|
| PENDING | VERIFIED | AI confidence ≥ 0.70 | WORKOUT_VERIFIED |
| PENDING | REJECTED | AI confidence < 0.70 | WORKOUT_REJECTED |
| REJECTED | PENDING | User re-uploads / appeals (future) | WORKOUT_UPLOADED |

### Terminal States
- VERIFIED is **final** — cannot be un-verified
- REJECTED can be retried via re-upload (new post)

### Invalid Transitions

| From | To | Why Invalid |
|------|----|-------------|
| VERIFIED | REJECTED | Verified is permanent |
| VERIFIED | PENDING | No rollback on verification |
| REJECTED | VERIFIED | Must go through PENDING first |

---

## MACHINE 3: STREAK LIFECYCLE

> ⚠️ **REDESIGNED (2026-06-01)** — see `STREAK_ENGINE_V2.md` §4 for the authoritative v2 spec.
> States are unchanged (`INACTIVE → ACTIVE ⇄ BROKEN`), but in v2:
> - `status` is a **projection** of the `DailyCompletion` ledger — only ever *set to the
>   recomputed value*, never nudged imperatively.
> - Transitions are driven by **local-calendar-day** arithmetic, not a rolling 24h window:
>   increment when `completion.localDate == lastVerifiedDate + 1`; break when
>   `currentLocalDate(user.tz) > lastVerifiedDate + 1`.
> - `lastVerifiedDate` (`DATE`) replaces `lastVerifiedAt` (`DateTime`) for streak logic.
> The v1 table below (rolling-24h, `lastVerifiedAt`-based) is retained for migration reference.

**Owner:** streaks module
**DB field:** `streaks.status`
**Enum:** `StreakStatus { INACTIVE, ACTIVE, BROKEN }`

### States

| State | Meaning | Counter |
|-------|---------|---------|
| INACTIVE | Never started (new user or fresh account) | current = 0 |
| ACTIVE | Maintaining daily streak | current ≥ 1 |
| BROKEN | Missed 24h window | current preserved until reset |

### Transitions

| From | To | Trigger | Counter Change |
|------|----|---------|---------------|
| INACTIVE | ACTIVE | First WORKOUT_VERIFIED | current = 1 |
| ACTIVE | ACTIVE | WORKOUT_VERIFIED (within 24h) | current += 1 |
| ACTIVE | BROKEN | Cron: 24h missed | No change (preserved for display) |
| BROKEN | ACTIVE | WORKOUT_VERIFIED | current = 1 (fresh start) |

### Counter Rules
```
ON transition to ACTIVE:
  IF from INACTIVE or BROKEN:
    current = 1
  ELIF from ACTIVE:
    current += 1
  best = MAX(best, current)
  lastVerifiedAt = post.createdAt
```

### Invalid Transitions

| From | To | Why Invalid |
|------|----|-------------|
| INACTIVE | BROKEN | Can't break what never started |
| BROKEN | BROKEN | Already broken |
| INACTIVE | INACTIVE | No self-transition |

---

## MACHINE 4: FRIENDSHIP STATE (Future)

**Owner:** friends module
**DB field:** `friendships.status`
**Enum:** `FriendshipStatus { PENDING, ACCEPTED, BLOCKED }`

### Transitions

| From | To | Trigger |
|------|----|---------|
| PENDING | ACCEPTED | Recipient accepts request |
| PENDING | (deleted) | Requester cancels or recipient rejects |
| ACCEPTED | (deleted) | Either user removes friendship |
| ACCEPTED | BLOCKED | Either user blocks the other |
| BLOCKED | (deleted) | Blocker unblocks |

---

## IMPLEMENTATION PATTERN

```typescript
// state-machines/streak.machine.ts

type StreakState = 'INACTIVE' | 'ACTIVE' | 'BROKEN';

const streakTransitions: Record<StreakState, Partial<Record<StreakState, string>>> = {
  INACTIVE: { ACTIVE: 'WORKOUT_VERIFIED' },
  ACTIVE:   { ACTIVE: 'WORKOUT_VERIFIED', BROKEN: 'STREAK_EVALUATION_TIMEOUT' },
  BROKEN:   { ACTIVE: 'WORKOUT_VERIFIED' },
};

function canTransition(from: StreakState, to: StreakState): boolean {
  return !!streakTransitions[from]?.[to];
}

function transition(from: StreakState, to: StreakState, event: DomainEvent): StreakState {
  if (!canTransition(from, to)) {
    logger.warn('Invalid streak transition', { from, to, event });
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
```

---

## ADDING NEW STATE MACHINES

1. Define states as a TypeScript enum
2. Define valid transitions as a transition map
3. Register in this document
4. Create `*.machine.ts` file in `/server/core/state-machines/`
5. All transitions must emit events
6. Invalid transitions must be logged
7. Update architecture.md
