# EVENT_CATALOG.md — BeActive Event Registry v2.0

> **Purpose:** Single source of truth for every event in the system. If an event isn't here, it doesn't exist.

---

## EVENT FORMAT (Universal)

```typescript
interface DomainEvent {
  id: string              // CUID — unique per event instance
  type: EventType         // Enum from this catalog
  userId: string          // Actor who caused the event
  timestamp: Date         // UTC — when it happened
  payload: Record<string, unknown>  // Event-specific data
  metadata: {
    source: string        // Module that emitted (e.g. "posts.service")
    correlationId?: string // Links related events in a chain
    version: number       // Schema version (start at 1)
  }
}
```

## EVENT RULES (Non-negotiable)

1. Events are **immutable** — never update or delete an event row
2. Events are **append-only** — INSERT only, no UPDATE/DELETE
3. Events are **replayable** — system state derivable from event log
4. Events must include `userId` and `timestamp` — always
5. Every state change **must** emit an event — no silent mutations
6. Events are stored in the `events` table — system of record

---

## REGISTRY

### AUTH EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `USER_SIGNED_UP` | auth.service | `{ email, username }` | notifications (welcome), streaks (create default row) | No |
| `USER_LOGGED_IN` | auth.service | `{ sessionId }` | analytics (future) | No |
| `USER_LOGGED_OUT` | auth.service | `{ sessionId }` | analytics (future) | No |

### WORKOUT EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `WORKOUT_UPLOADED` | posts.service | `{ postId, imageKey, userId }` | AI classification worker | Yes |
| `WORKOUT_VERIFIED` | ai.worker | `{ postId, workoutId, type, confidence }` | rule engine → streaks, feed, stories, notifications | No |
| `WORKOUT_REJECTED` | ai.worker | `{ postId, confidence, reason }` | notifications (inform user) | No |

### STREAK EVENTS

> ⚠️ **REDESIGNED (2026-06-01)** for the calendar-day model — see `STREAK_ENGINE_V2.md` §7.
> Changes in v2:
> - **NEW** `DAILY_COMPLETION_RECORDED` (authoritative fact) is emitted when a `DailyCompletion`
>   ledger row is created (first verified workout of a user's local date).
> - `STREAK_UPDATED` payload gains `reason: STARTED | CONTINUED | RESET` and collapses the
>   need for separate INCREMENTED/RESET/RECOVERED events. `STREAK_RECOVERED` is folded into
>   `STREAK_UPDATED {reason: RESET}`.
> - `STREAK_AT_RISK` becomes **notification-only**, idempotent per `(userId, localDate)`;
>   its payload is time-of-day driven, not `hoursSinceLastWorkout`.
> - `STREAK_BROKEN` source is the repurposed cron (notifications + analytics finalization);
>   correctness no longer depends on it (status is recomputed on read).
> The v1 rows below are retained for shadow-migration reference.

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `DAILY_COMPLETION_RECORDED` *(v2)* | streaks.service | `{ userId, localDate, postId }` | notifications, feed, streak recompute | No |
| `STREAK_UPDATED` | streaks.service | v1: `{ userId, current, best, status }` · v2: `{ userId, currentStreak, bestStreak, status, reason }` | feed (streak boost), notifications | No |
| `STREAK_AT_RISK` | streak.worker (cron) | v1: `{ userId, hoursSinceLastWorkout, currentStreak }` · v2: `{ userId, localDate, currentStreak }` | notifications (urgent push) | Yes |
| `STREAK_BROKEN` | streak.worker (cron) | `{ userId, finalStreak, brokenAt }` | notifications, feed | No |
| `STREAK_RECOVERED` *(v1 only — folded into STREAK_UPDATED in v2)* | streaks.service | `{ userId, newStreak }` | notifications | No |

### FEED EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `FEED_POST_CREATED` | feed.service | `{ postId, userId }` | cache invalidation | Yes |

### SOCIAL EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `FRIEND_REQUEST_SENT` | friends.service | `{ fromUserId, toUserId, friendshipId }` | notifications | No |
| `FRIEND_REQUEST_ACCEPTED` | friends.service | `{ friendshipId, userAId, userBId }` | notifications, feed visibility | No |
| `FRIEND_REMOVED` | friends.service | `{ friendshipId, removedBy }` | feed cache invalidation | Yes |
| `USER_BLOCKED` | friends.service | `{ friendshipId, blockerId, blockedId }` | feed cache invalidation, search exclusion | Yes |
| `USER_UNBLOCKED` | friends.service | `{ friendshipId, blockerId, unblockedId }` | search re-inclusion | Yes |

### STORY EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `STORY_PUBLISHED` | stories.service | `{ postId, userId, expiresAt }` | feed (story bar) | No |
| `STORY_EXPIRED` | story.worker (cron) | `{ postId, userId }` | feed cache | Yes |
| `STORY_GENERATED` | stories.service | `{ postId, shareVersion, renderMs, workoutType, streakCount, isPersonalBest }` | analytics (future) | No |
| `STORY_SHARED` | stories.service | `{ postId, shareVersion, method, workoutType, streakCount }` | analytics (future) | No |

### MESSAGE EVENTS (Post-MVP)

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `SNAP_SENT` | messages.service | `{ messageId, senderId, receiverId }` | notifications | No |
| `SNAP_RECEIVED` | messages.service | `{ messageId, senderId, receiverId }` | notifications | No |

### NOTIFICATION EVENTS

| Type | Source | Payload | Consumers | Async? |
|------|--------|---------|-----------|--------|
| `NOTIFICATION_CREATED` | notifications.service | `{ notificationId, userId, type }` | delivery worker (push) | Yes |

---

## EVENT CHAINS (Common Sequences)

### Workout Upload → Feed Post
```
WORKOUT_UPLOADED
  → (AI worker processes)
  → WORKOUT_VERIFIED
  → (Rule R3: streak update)
  → STREAK_UPDATED
  → (Rule R4: create feed post)
  → FEED_POST_CREATED
  → STORY_PUBLISHED
  → NOTIFICATION_CREATED (friend notifications)
```

### Streak Break
```
(Cron detects 20h gap)
  → STREAK_AT_RISK
  → NOTIFICATION_CREATED (urgent warning)
(Cron detects 24h gap)
  → STREAK_BROKEN
  → NOTIFICATION_CREATED (streak broken alert)
```

### New User Signup
```
USER_SIGNED_UP
  → (Rule R9: welcome flow)
  → NOTIFICATION_CREATED (welcome message)
  → (Default streak row created: INACTIVE)
```

---

## ADDING NEW EVENTS

Before adding a new event:
1. Check if an existing event already covers the use case
2. Define the payload shape with TypeScript interface
3. Register it in this catalog with source + consumers
4. Add it to the EventType enum in `/server/core/events/types.ts`
5. Create handlers for all listed consumers
6. Update architecture.md if it affects state machines or rules

**No event exists outside this catalog.**
