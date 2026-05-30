# RULE_REGISTRY.md — BeActive Business Rules v2.0

> **Purpose:** Every business rule in one place. If logic isn't registered here, it doesn't belong in the system.

---

## RULE FORMAT

```typescript
interface Rule {
  id: string                    // R1, R2, etc.
  name: string                  // Human-readable name
  trigger: EventType            // Which event activates this rule
  condition: (event, ctx) => boolean  // When to fire
  actions: Action[]             // What to execute
  priority: number              // Lower = higher priority
  async: boolean                // Does this run async?
}
```

## EXECUTION ORDER

1. Event arrives at rule engine
2. All rules matching the event's `trigger` are collected
3. Rules sorted by `priority` (ascending)
4. Each rule's `condition` evaluated against current state
5. Matching rules' `actions` dispatched
6. Sync actions execute immediately; async actions queued

---

## RULES

### R1 — Verify Workout
| Field | Value |
|-------|-------|
| Trigger | `WORKOUT_UPLOADED` (after AI classification completes) |
| Condition | `aiClassification.confidence >= 0.70` |
| Actions | Transition post → VERIFIED, Create workout record, Emit `WORKOUT_VERIFIED` |
| Priority | 1 |
| Async | No |

### R2 — Reject Workout
| Field | Value |
|-------|-------|
| Trigger | `WORKOUT_UPLOADED` (after AI classification completes) |
| Condition | `aiClassification.confidence < 0.70` |
| Actions | Transition post → REJECTED, Emit `WORKOUT_REJECTED`, Notify user |
| Priority | 1 |
| Async | No |

### R3 — Update Streak
| Field | Value |
|-------|-------|
| Trigger | `WORKOUT_VERIFIED` |
| Condition | Always (every verified workout affects streaks) |
| Actions | Evaluate streak state machine, increment or restart counter, update `lastVerifiedAt`, emit `STREAK_UPDATED` |
| Priority | 2 |
| Async | No |

### R4 — Create Feed Post
| Field | Value |
|-------|-------|
| Trigger | `WORKOUT_VERIFIED` |
| Condition | Always |
| Actions | Create feed entry, publish to story (24h), emit `FEED_POST_CREATED` + `STORY_PUBLISHED` |
| Priority | 3 |
| Async | Yes (feed indexing) |

### R5 — Risk Warning (Cron)
| Field | Value |
|-------|-------|
| Trigger | Cron evaluation (hourly) |
| Condition | `NOW() - user.lastVerifiedAt >= 20 hours AND user.activityState = ACTIVE` |
| Actions | Transition user → AT_RISK, emit `STREAK_AT_RISK`, send urgent notification |
| Priority | 1 |
| Async | Yes |

### R6 — Break Streak (Cron)
| Field | Value |
|-------|-------|
| Trigger | Cron evaluation (hourly) |
| Condition | `NOW() - user.lastVerifiedAt >= 24 hours AND user.activityState IN (ACTIVE, AT_RISK)` |
| Actions | Transition streak → BROKEN, user → BROKEN, emit `STREAK_BROKEN`, notify user |
| Priority | 1 |
| Async | Yes |

### R7 — Notify Friends on Workout
| Field | Value |
|-------|-------|
| Trigger | `WORKOUT_VERIFIED` |
| Condition | User has ≥ 1 accepted friend |
| Actions | Create notification for each friend: "X just posted a workout" |
| Priority | 4 |
| Async | Yes |

### R8 — Friend Acceptance
| Field | Value |
|-------|-------|
| Trigger | `FRIEND_REQUEST_ACCEPTED` |
| Condition | Always |
| Actions | Notify both users, enable mutual feed visibility |
| Priority | 3 |
| Async | No |

### R9 — Welcome Flow
| Field | Value |
|-------|-------|
| Trigger | `USER_SIGNED_UP` |
| Condition | Always |
| Actions | Create default streak row (INACTIVE, current=0), send welcome notification |
| Priority | 5 |
| Async | No |

---

## RULE CONSTRAINTS

1. **Rules never modify state directly** — they request transitions from state machines
2. **Rules are stateless** — they evaluate based on event + current DB state only
3. **Rules are idempotent** — running the same rule twice with the same input produces the same output
4. **Rules are registered centrally** — no business logic hiding in controllers, repos, or frontend
5. **New rules require architect approval** — prevents logic sprawl

---

## ADDING NEW RULES

1. Define trigger event, condition, and actions
2. Assign a unique ID (R10, R11, etc.)
3. Register in this document
4. Implement in `/server/core/rules/registry.ts`
5. Write unit tests for the rule
6. Update EVENT_CATALOG.md if new events are emitted
7. Update STATE_MACHINE_REGISTRY.md if new transitions are introduced
