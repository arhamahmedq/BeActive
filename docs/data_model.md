# DATA_MODEL.md — BeActive Database Schema v2.0

> **Owner:** Architect Agent | **Synced with:** architecture.md, security.md

---

## 1. OVERVIEW

PostgreSQL relational database accessed exclusively through Prisma ORM.

**Design principles:**
- Every table has a clear owner module
- State machine fields use enums (not free-text)
- Events table is append-only (system of record)
- Feed is computed, not stored (MVP)
- All timestamps in UTC
- Foreign keys enforce referential integrity
- Indexes optimized for read-heavy feed + friend queries

---

## 2. ENTITY RELATIONSHIP MAP

```
users ──1:1──▶ streaks
  │
  ├──1:N──▶ posts ──1:1──▶ workouts
  │
  ├──1:N──▶ notifications
  │
  ├──M:N──▶ friendships (self-referential)
  │
  ├──1:N──▶ messages (as sender)
  │
  └──1:N──▶ events (as actor)
```

---

## 3. SCHEMA DEFINITIONS

### 3.1 Users

**Owner module:** auth, users

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  username      String    @unique
  displayName   String?
  avatarUrl     String?
  bio           String?   @db.VarChar(160)
  timezone      String    @default("UTC")
  activityState UserActivityState @default(ACTIVE)
  role          UserRole  @default(USER)
  onboarded     Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  posts           Post[]
  streak          Streak?
  friendshipsA    Friendship[] @relation("FriendA")
  friendshipsB    Friendship[] @relation("FriendB")
  notifications   Notification[]
  sentMessages    Message[] @relation("Sender")
  receivedMessages Message[] @relation("Receiver")
  events          Event[]

  @@index([email])
  @@index([username])
  @@index([activityState])
}

enum UserActivityState {
  ACTIVE      // Streak healthy, posting regularly
  AT_RISK     // 20h since last workout, warning sent
  BROKEN      // 24h+ since last workout, streak broken
}

enum UserRole {
  USER
  ADMIN
}
```

**Notes:**
- `passwordHash` is NOT stored here — managed by Supabase Auth
- `activityState` is a state machine field — only changed via valid transitions
- `timezone` used for notification scheduling, NOT streak calculation (streaks use UTC)

---

### 3.2 Posts (Workout Submissions)

**Owner module:** posts

```prisma
model Post {
  id          String     @id @default(cuid())
  userId      String
  imageUrl    String
  imageKey    String     // R2 object key for deletion
  caption     String?    @db.VarChar(500)
  status      PostStatus @default(PENDING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  // Relations
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  workout     Workout?

  @@index([userId, createdAt(sort: Desc)])
  @@index([status, createdAt(sort: Desc)])
}

enum PostStatus {
  PENDING     // Uploaded, awaiting AI classification
  VERIFIED    // AI confirmed as workout (confidence >= 0.70)
  REJECTED    // AI rejected (confidence < 0.70)
}
```

**Constraints:**
- One VERIFIED post per user per UTC day (enforced in service layer)
- `imageKey` stored for lifecycle management (deletion from R2)
- EXIF stripped before storage — imageUrl points to clean version

---

### 3.3 Workouts (AI Classification Results)

**Owner module:** workouts, ai

```prisma
model Workout {
  id            String       @id @default(cuid())
  postId        String       @unique
  type          WorkoutType
  aiConfidence  Float        // 0.00 - 1.00
  modelVersion  String       // Track which AI model version classified this
  processedAt   DateTime     @default(now())

  // Relations
  post          Post         @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([type])
  @@index([aiConfidence])
}

enum WorkoutType {
  GYM
  RUNNING
  CYCLING
  SWIMMING
  OUTDOOR
  SPORTS
  OTHER
}
```

**Notes:**
- Workout is a 1:1 extension of Post — created only after AI processes the image
- `modelVersion` critical for debugging classification drift
- Workout does NOT contain streak logic — streak is a separate concern

---

### 3.4 Streaks

**Owner module:** streaks

```prisma
model Streak {
  id              String      @id @default(cuid())
  userId          String      @unique
  current         Int         @default(0)
  best            Int         @default(0)
  status          StreakStatus @default(INACTIVE)
  lastVerifiedAt  DateTime?   // Timestamp of last VERIFIED workout
  brokenAt        DateTime?   // When streak was last broken
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([lastVerifiedAt])
}

enum StreakStatus {
  INACTIVE    // Never started or account new
  ACTIVE      // Currently maintaining streak
  BROKEN      // Missed 24h window
}
```

**Streak update rules (CRITICAL — deterministic):**

```
ON WORKOUT_VERIFIED:
  IF streak.status = INACTIVE or BROKEN:
    current = 1
    status = ACTIVE
    lastVerifiedAt = post.createdAt
  ELIF streak.status = ACTIVE:
    IF post.createdAt - lastVerifiedAt <= 24 hours:
      current += 1
      lastVerifiedAt = post.createdAt
    ELSE:
      // This shouldn't happen (cron should have broken it)
      // Safety net: reset
      current = 1
      lastVerifiedAt = post.createdAt
  best = MAX(best, current)

ON STREAK_EVALUATION_CRON (hourly):
  FOR each user WHERE status = ACTIVE:
    hours_since = NOW() - lastVerifiedAt
    IF hours_since >= 24:
      status = BROKEN
      brokenAt = NOW()
      EMIT STREAK_BROKEN
    ELIF hours_since >= 20:
      user.activityState = AT_RISK
      EMIT STREAK_AT_RISK
```

---

### 3.5 Friendships (Social Graph)

**Owner module:** friends

```prisma
model Friendship {
  id          String           @id @default(cuid())
  userAId     String           // Always the requester
  userBId     String           // Always the recipient
  status      FriendshipStatus
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  // Relations
  userA       User @relation("FriendA", fields: [userAId], references: [id], onDelete: Cascade)
  userB       User @relation("FriendB", fields: [userBId], references: [id], onDelete: Cascade)

  @@unique([userAId, userBId])
  @@index([userAId, status])
  @@index([userBId, status])
}

enum FriendshipStatus {
  PENDING     // Request sent, awaiting acceptance
  ACCEPTED    // Mutual friendship active
  BLOCKED     // One user blocked the other
}
```

**Constraints:**
- `@@unique([userAId, userBId])` prevents duplicate friendships
- Service layer enforces: `userAId != userBId` (no self-friendship)
- Service layer normalizes: requester always = userA
- Querying friends requires checking BOTH sides: `WHERE (userAId = me OR userBId = me) AND status = ACCEPTED`

---

### 3.6 Notifications

**Owner module:** notifications

```prisma
model Notification {
  id          String             @id @default(cuid())
  userId      String             // Recipient
  type        NotificationType
  title       String
  body        String?
  data        Json?              // Event-specific payload
  read        Boolean            @default(false)
  createdAt   DateTime           @default(now())

  // Relations
  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Idempotency: prevent duplicates
  idempotencyKey String?         @unique

  @@index([userId, read, createdAt(sort: Desc)])
  @@index([userId, type])
}

enum NotificationType {
  WELCOME
  FRIEND_REQUEST
  FRIEND_ACCEPTED
  WORKOUT_VERIFIED
  WORKOUT_REJECTED
  FRIEND_POSTED
  STREAK_AT_RISK
  STREAK_BROKEN
}
```

**Idempotency:**
- `idempotencyKey` = `${userId}:${type}:${DATE(timestamp)}` for daily-unique notifications
- Prevents duplicate streak warnings, duplicate friend request notifications

---

### 3.7 Events (Append-Only Event Log)

**Owner module:** core/events

```prisma
model Event {
  id            String   @id @default(cuid())
  type          String   // Event type enum value
  userId        String   // Actor who caused the event
  payload       Json     // Event-specific data
  source        String   // Module that emitted (e.g., "posts.service")
  correlationId String?  // For tracing event chains
  createdAt     DateTime @default(now())

  // Relations
  user          User     @relation(fields: [userId], references: [id])

  @@index([type, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@index([correlationId])
}
```

**Rules:**
- NEVER update or delete rows in this table
- This is the system of record — truth of what happened
- Used for: debugging, audit trail, event replay, analytics
- At scale: partition by `createdAt` monthly, archive old events to cold storage

---

### 3.8 Messages (DMs — Post-MVP)

**Owner module:** messages

```prisma
model Message {
  id          String   @id @default(cuid())
  senderId    String
  receiverId  String
  content     String?  @db.VarChar(2000)
  imageUrl    String?
  imageKey    String?
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())

  sender      User     @relation("Sender", fields: [senderId], references: [id])
  receiver    User     @relation("Receiver", fields: [receiverId], references: [id])

  @@index([senderId, receiverId, createdAt(sort: Desc)])
  @@index([receiverId, read, createdAt(sort: Desc)])
}
```

---

## 4. INDEXING STRATEGY SUMMARY

| Table | Index | Purpose |
|-------|-------|---------|
| users | email (unique) | Login lookup |
| users | username (unique) | Profile lookup |
| users | activityState | Cron: find AT_RISK users |
| posts | (userId, createdAt DESC) | User's posts, feed queries |
| posts | (status, createdAt DESC) | Feed: only VERIFIED posts |
| streaks | status | Cron: find active streaks to evaluate |
| streaks | lastVerifiedAt | Cron: time-based streak checks |
| friendships | (userAId, status) | Friend graph queries |
| friendships | (userBId, status) | Friend graph queries (reverse) |
| notifications | (userId, read, createdAt DESC) | Notification feed |
| events | (type, createdAt DESC) | Event replay by type |
| events | (userId, createdAt DESC) | User activity audit |

---

## 5. DATA INTEGRITY RULES

1. No orphan posts — `onDelete: Cascade` from User
2. No self-friendships — enforced in service layer
3. One streak per user — `@unique` on userId
4. One workout per post — `@unique` on postId
5. No duplicate friendships — `@@unique([userAId, userBId])`
6. Events never deleted — no cascade, no soft delete
7. All writes go through service layer — repos are dumb data access
8. passwordHash managed by Supabase Auth — not in our schema

---

## 6. SCALING CONSIDERATIONS

| Phase | Change |
|-------|--------|
| MVP | Direct Prisma queries, no caching |
| 10k users | Redis cache for friend lists + feed results |
| 100k users | Read replica for feed queries |
| 500k users | Materialized feed table (async rebuild) |
| 1M+ users | Event table partitioning, archive to cold storage |

---

## 7. MIGRATION STRATEGY

- Prisma Migrate for all schema changes
- Every migration reviewed before deploy
- Destructive migrations (column drops) require 2-phase: deprecate → remove
- AI agents MUST NOT run `prisma migrate` without architect approval
