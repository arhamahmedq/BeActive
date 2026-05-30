# STREAK_ENGINE.md — BeActive Streak System v2.0

> **Purpose:** Complete specification of the streak system — the single most important retention mechanic.

---

## 1. WHY STREAKS MATTER

Streaks are not a feature. They are the **behavioral engine** of BeActive.

**Psychology:** Loss aversion makes breaking a 30-day streak feel more painful than missing one gym session. This converts occasional exercisers into daily ones.

**Business:** Streak length directly correlates with retention. Users with 7+ day streaks have 3-5x higher D30 retention than users without.

---

## 2. CORE MECHANICS

### Streak Window
- **Type:** Rolling 24-hour window from last verified workout
- **NOT** calendar-day based (avoids timezone nightmares)
- **All calculations in UTC**

### Timeline
```
T+0h    User posts workout → AI verifies → streak increments
T+20h   No new workout → user state → AT_RISK, notification sent
T+24h   Still no workout → streak → BROKEN, counter preserved in 'best'
```

### Counter Rules
```
First workout ever:     current = 1, best = 1
Next day workout:       current += 1, best = MAX(best, current)
Missed 24h window:      status = BROKEN (current preserved for display)
Post after break:       current = 1 (fresh start)
```

---

## 3. STATE MACHINE

```
INACTIVE ──[first workout]──▶ ACTIVE (current=1)
    │                            │
    │                     [workout within 24h]
    │                            │
    │                     ACTIVE ──▶ ACTIVE (current+=1)
    │                            │
    │                     [24h missed]
    │                            │
    │                     ACTIVE ──▶ BROKEN
    │                                   │
    │                            [workout posted]
    │                                   │
    └────────────────────── BROKEN ──▶ ACTIVE (current=1)
```

---

## 4. EVALUATION TRIGGERS

### Trigger 1: Synchronous (on workout verification)
```
Event: WORKOUT_VERIFIED
Handler: streaks.service.onWorkoutVerified(event)

Logic:
  1. Fetch user's streak record
  2. IF status = INACTIVE or BROKEN:
       current = 1, status = ACTIVE
  3. ELIF status = ACTIVE:
       IF (post.createdAt - lastVerifiedAt) <= 24h:
         current += 1
       ELSE:
         current = 1 (safety net — cron should have broken it)
  4. best = MAX(best, current)
  5. lastVerifiedAt = post.createdAt
  6. user.activityState = ACTIVE
  7. Emit STREAK_UPDATED
```

### Trigger 2: Cron Job (hourly streak evaluation)
```
Schedule: Every hour (*/60 * * * *)
Handler: workers/streakEvaluator.ts

Logic:
  1. Query all users WHERE streak.status = ACTIVE
  2. FOR each user:
       hoursSince = NOW() - lastVerifiedAt (in hours)
       IF hoursSince >= 24:
         streak.status = BROKEN
         streak.brokenAt = NOW()
         user.activityState = BROKEN
         Emit STREAK_BROKEN
       ELIF hoursSince >= 20 AND user.activityState = ACTIVE:
         user.activityState = AT_RISK
         Emit STREAK_AT_RISK
```

---

## 5. EDGE CASES

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Two workouts same UTC day | Second workout ignored (no double increment) | Streaks measure daily consistency, not volume |
| Workout at 23:59, next at 00:01 | Valid — within 24h rolling window | Not calendar-day based |
| AI takes 2 hours to classify | Streak uses `post.createdAt`, NOT `workout.processedAt` | User shouldn't be penalized for AI latency |
| User changes timezone setting | No effect on streak calculation | All streak math is UTC |
| Server downtime during cron | Next cron run catches up using timestamps | No wall-clock dependency |
| User deletes post | Streak remains (no retroactive break) | Prevents accidental streak loss |
| Multiple posts PENDING at once | Only first VERIFIED triggers streak update | Idempotency via lastVerifiedAt comparison |

---

## 6. NOTIFICATION INTEGRATION

| Hours Since Last Workout | Notification | Priority |
|--------------------------|-------------|----------|
| 20h | "Your streak is at risk! Post a workout to keep it alive" | URGENT |
| 23h | "Last chance! Your X-day streak expires in 1 hour" | CRITICAL |
| 24h+ | "Your X-day streak has ended. Start a new one today!" | HIGH |

**Notification idempotency:** One AT_RISK notification per 24h cycle maximum. Key: `userId:STREAK_AT_RISK:YYYY-MM-DD`

---

## 7. DATABASE SCHEMA

```prisma
model Streak {
  id              String      @id @default(cuid())
  userId          String      @unique
  current         Int         @default(0)
  best            Int         @default(0)
  status          StreakStatus @default(INACTIVE)
  lastVerifiedAt  DateTime?
  brokenAt        DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([lastVerifiedAt])
}

enum StreakStatus {
  INACTIVE
  ACTIVE
  BROKEN
}
```

---

## 8. API ENDPOINTS

| Method | Path | Response | Notes |
|--------|------|----------|-------|
| GET | /api/streaks/me | `{ current, best, status, lastVerifiedAt }` | Authenticated user's streak |
| GET | /api/streaks/:userId | `{ current, best, status }` | Public streak info (for friend profiles) |

---

## 9. FAILURE MODES

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Cron job fails to run | Users not warned, streaks not broken on time | Health check on cron. If missed >2 hours, alert admin. Next run catches up via timestamps. |
| Database write fails during streak update | Streak desynchronized | Retry with idempotency. Log correlation ID. |
| Duplicate WORKOUT_VERIFIED events | Double increment | Guard: compare `post.createdAt` with `lastVerifiedAt`. If same post, skip. |
| Clock skew between servers | Incorrect hour calculations | All timestamps from DB (server UTC), never client clock. |

---

## 10. SCALING CONSIDERATIONS

| Phase | Change |
|-------|--------|
| MVP | Direct Prisma query in cron, process all ACTIVE users |
| 10k users | Batch processing in cron (chunks of 500) |
| 100k users | BullMQ job per user, parallel processing |
| 1M+ users | Dedicated streak evaluation service, partitioned by user ID |

---

## 11. ANTI-PATTERNS

1. **Never calculate streaks from post history on every request** — use the streak table as materialized state
2. **Never use client timestamps for streak logic** — server UTC only
3. **Never allow frontend to call "increment streak" directly** — only WORKOUT_VERIFIED events trigger it
4. **Never skip the state machine** — all transitions validated
5. **Never store streak in localStorage** — server is source of truth
