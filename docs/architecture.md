# ARCHITECTURE.md — BeActive Production Architecture v2.0

> **Owner:** Architect Agent | **Status:** Production Blueprint | **Last Sync:** Phase 1

---

## 1. SYSTEM IDENTITY

**BeActive** is a deterministic, event-driven, modular monolith social fitness platform.

It combines:
- **BeReal** — daily photo proof mechanic
- **Instagram** — stories + social feed
- **TikTok/Snapchat** — streaks as retention hooks
- **Strava** — activity logging + fitness identity

**Core thesis:** Bridge the gap between Strava (serious athletes) and casual fitness users by making daily activity social, streak-driven, and emotionally engaging.

**Platform:** Web-first (Next.js), mobile later (React Native).

---

## 2. ARCHITECTURE MODEL

```
Modular Monolith + Event-Driven Core + State Machine Enforcement
```

### Why this model:
- **Modular monolith** — one deployable unit, strict internal boundaries, extract services only when proven bottleneck exists
- **Event-driven core** — every mutation emits an immutable event; enables replay, audit, async fan-out
- **State machines** — streak, workout, and user lifecycle are governed by formal state transitions, not scattered if/else logic

### What we intentionally avoid (and when we'd reconsider):
| Avoided | Reconsider When |
|---------|----------------|
| Microservices | >500k DAU or team >15 engineers |
| Kubernetes | Need multi-region or >50 containers |
| Distributed queues (Kafka/SQS) | Event throughput >10k/sec |
| Event sourcing (full) | Need complete audit/replay for compliance |
| GraphQL | Client diversity demands it |

---

## 3. HIGH-LEVEL REQUEST FLOW

```
CLIENT (Next.js Web App)
    │
    ▼
API LAYER (Next.js API Routes / Express)
    │  ← Auth middleware, rate limiting, Zod validation
    ▼
CONTROLLER (thin — route → service delegation)
    │
    ▼
SERVICE LAYER (business logic execution)
    │
    ├──▶ EVENT EMITTER (append to events table)
    │         │
    │         ▼
    │    EVENT HANDLERS (sync fan-out)
    │         │
    │         ├──▶ RULE ENGINE (evaluate business rules)
    │         │         │
    │         │         ▼
    │         │    STATE MACHINE ENGINE (transition if valid)
    │         │
    │         ├──▶ NOTIFICATION DISPATCHER (async)
    │         └──▶ FEED INDEXER (async)
    │
    ▼
REPOSITORY LAYER (Prisma → PostgreSQL)
    │
    ├──▶ Object Storage (Cloudflare R2) for media
    └──▶ Cache Layer (in-memory MVP → Redis at scale)
```

**Key invariant:** Services emit events. Events trigger rules. Rules request state transitions. State machines validate transitions. Only valid transitions persist. This chain is unbreakable.

---

## 4. TECH STACK (LOCKED FOR MVP)

### Frontend
| Technology | Purpose | Why chosen |
|-----------|---------|------------|
| Next.js 14+ (App Router) | Full-stack React framework | SSR, API routes, Vercel deploy, single codebase |
| TypeScript | Type safety | Catch errors at compile time, AI-readable |
| TailwindCSS | Utility-first CSS | Fast iteration, consistent design, small bundle |
| Zustand | Client state | Lightweight, no boilerplate, good with Next.js |
| TanStack Query | Server state / caching | Deduplication, background refresh, optimistic updates |

### Backend
| Technology | Purpose | Why chosen |
|-----------|---------|------------|
| Next.js API Routes | API layer (MVP) | Unified deploy, simple routing |
| Express (extraction path) | Standalone API | When API routes hit serverless limits |
| Zod | Input validation | TypeScript-native, composable schemas |
| node-cron / BullMQ | Scheduled jobs / queues | Streak evaluation, notifications |

### Data
| Technology | Purpose | Why chosen |
|-----------|---------|------------|
| PostgreSQL | Primary database | Relational integrity, social graph, JSON support |
| Prisma | ORM | Type-safe queries, migrations, schema-as-code |
| Cloudflare R2 | Object storage | S3-compatible, no egress fees, CDN-ready |

### Infrastructure
| Technology | Purpose | Why chosen |
|-----------|---------|------------|
| Vercel | Frontend + API hosting | Zero-config deploy, edge network |
| Railway | Backend services (if extracted) | Simple container deploy, managed Postgres |
| Supabase | Auth + managed Postgres option | Auth SDK, realtime subscriptions, free tier |

### Auth (DECISION: Supabase Auth)
- **Chosen:** Supabase Auth
- **Why:** Built-in email/password + OAuth, JWT + refresh tokens, row-level security option, free tier generous
- **Session model:** HTTP-only secure cookies with rotating refresh tokens
- **Rejected:** Clerk (cost at scale), raw JWT (security burden), NextAuth (complexity)

---

## 5. CORE SYSTEM PRIMITIVES

The entire backend is built on 5 primitives. Every feature decomposes into these:

### 5.1 Event System (What happened)
- Every state change emits an immutable event
- Events are append-only, never deleted or modified
- Events enable: audit trail, replay, async processing, debugging
- MVP: in-process EventEmitter + events table
- Scale: Redis Pub/Sub or BullMQ

### 5.2 State Machines (What exists now)
- User, Workout, and Streak each have formal state machines
- Only events can trigger transitions
- Invalid transitions are rejected and logged
- State is always derivable from event history

### 5.3 Rule Engine (What should happen)
- Centralized business rules evaluated on every relevant event
- Rules are declarative: IF (condition) THEN (action)
- Rules never modify state directly — they request state transitions
- All rules registered in a single registry for auditability

### 5.4 AI Classification Layer (Read-only intelligence)
- AI receives image → returns classification payload
- AI has ZERO write access to database
- AI has ZERO authority over streaks, feeds, or state
- AI output feeds into Rule Engine as data, not decisions
- Output: `{ isWorkout: boolean, type: string, confidence: number }`

### 5.5 Execution Services (Actors, not decision-makers)
- Services execute actions requested by the rule engine
- Services never contain business logic branching
- Services are thin wrappers around repository + external calls

---

## 6. MODULE ARCHITECTURE

### 6.1 Repository Structure

```
/
├── apps/
│   └── web/                          # Next.js frontend
│       ├── app/                      # App Router pages
│       │   ├── (auth)/               # Auth group (login, signup)
│       │   ├── (main)/               # Authenticated group (feed, profile, upload)
│       │   └── api/                  # API routes (thin controllers)
│       ├── components/
│       │   ├── ui/                   # Design system primitives
│       │   ├── features/             # Feature-specific components
│       │   └── layouts/              # Page layouts
│       ├── hooks/                    # Custom React hooks
│       ├── lib/                      # Client utilities
│       └── styles/                   # Global styles
│
├── server/                           # Backend domain logic
│   ├── core/                         # System primitives (shared)
│   │   ├── events/
│   │   │   ├── bus.ts                # EventEmitter singleton
│   │   │   ├── types.ts             # All event type definitions
│   │   │   └── handlers.ts          # Event → handler registry
│   │   ├── rules/
│   │   │   ├── engine.ts            # Rule evaluation engine
│   │   │   ├── registry.ts          # All rules registered here
│   │   │   └── types.ts             # Rule type definitions
│   │   ├── state-machines/
│   │   │   ├── user.machine.ts
│   │   │   ├── workout.machine.ts
│   │   │   └── streak.machine.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Auth guard middleware
│   │   │   ├── rateLimit.ts         # Rate limiting
│   │   │   └── validate.ts          # Zod validation middleware
│   │   ├── errors/
│   │   │   └── AppError.ts          # Structured error classes
│   │   └── logger/
│   │       └── index.ts             # Structured logging
│   │
│   ├── modules/                      # Domain modules
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repo.ts
│   │   │   ├── auth.schema.ts       # Zod schemas
│   │   │   └── auth.types.ts
│   │   ├── users/
│   │   ├── posts/
│   │   ├── workouts/
│   │   ├── streaks/
│   │   ├── feed/
│   │   ├── friends/
│   │   ├── notifications/
│   │   ├── stories/
│   │   └── ai/
│   │
│   └── workers/                      # Async job processors
│       ├── streakEvaluator.ts        # Cron: check at-risk streaks
│       ├── aiClassifier.ts           # Process workout images
│       ├── notificationDispatcher.ts # Deliver notifications
│       └── feedIndexer.ts            # Rebuild feed caches
│
├── shared/                           # Cross-boundary types
│   ├── types/                        # API request/response types
│   ├── constants/                    # Enums, magic numbers
│   └── utils/                        # Pure utility functions
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── infra/
│   ├── docker/
│   └── scripts/
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### 6.2 Module Internal Structure (ENFORCED)

Every module in `/server/modules/*` follows:

```
module/
  module.controller.ts    # Route handler — thin, delegates to service
  module.service.ts       # Business logic — emits events, calls rules
  module.repo.ts          # Database queries — Prisma only
  module.schema.ts        # Zod validation schemas
  module.types.ts         # Module-internal TypeScript types
```

**Rules:**
- Controllers: parse request → call service → return response. No logic.
- Services: execute business operations, emit events. All logic lives here.
- Repos: Prisma queries only. No business logic. No event emission.
- Cross-module calls: service-to-service only. Never repo-to-repo.

---

## 7. EVENT CATALOG

### 7.1 Event Format (Universal)

```typescript
interface DomainEvent {
  id: string            // CUID
  type: EventType       // Enum value
  userId: string        // Actor who caused it
  timestamp: Date       // UTC
  payload: Record<string, unknown>  // Event-specific data
  metadata?: {
    source: string      // Module that emitted
    correlationId?: string  // For tracing chains
  }
}
```

### 7.2 Event Registry

| Event | Emitted By | Consumed By | Async? |
|-------|-----------|-------------|--------|
| USER_SIGNED_UP | auth.service | notifications, onboarding | No |
| USER_LOGGED_IN | auth.service | analytics (future) | No |
| WORKOUT_UPLOADED | posts.service | ai worker, streaks | Yes (AI) |
| WORKOUT_VERIFIED | ai worker | rules engine → streaks, feed, stories | No |
| WORKOUT_REJECTED | ai worker | notifications | No |
| STREAK_UPDATED | streaks.service | notifications, feed boost | No |
| STREAK_AT_RISK | streak worker (cron) | notifications (urgent) | Yes |
| STREAK_BROKEN | streak worker (cron) | notifications, feed | No |
| STREAK_RECOVERED | streaks.service | notifications | No |
| FEED_POST_CREATED | feed.service | cache invalidation | Yes |
| STORY_PUBLISHED | stories.service | feed, notifications | No |
| FRIEND_REQUEST_SENT | friends.service | notifications | No |
| FRIEND_REQUEST_ACCEPTED | friends.service | notifications, feed | No |
| FRIEND_REMOVED | friends.service | feed cache invalidation | Yes |
| SNAP_SENT | messages.service | notifications | No |
| SNAP_RECEIVED | messages.service | notifications | No |
| NOTIFICATION_CREATED | notifications.service | delivery worker | Yes |

### 7.3 Event Rules
- Events are **immutable** — never updated or deleted
- Events are **append-only** — stored in `events` table
- Events are **replayable** — system state can be rebuilt from event log
- Events must include `userId` and `timestamp` always

---

## 8. STATE MACHINE DEFINITIONS

### 8.1 User Activity State Machine

```
States: ACTIVE, AT_RISK, BROKEN

Transitions:
  ACTIVE   →  AT_RISK    [trigger: no workout posted for 20 hours]
  AT_RISK  →  BROKEN     [trigger: no workout posted for 24 hours]
  AT_RISK  →  ACTIVE     [trigger: WORKOUT_VERIFIED received]
  BROKEN   →  ACTIVE     [trigger: WORKOUT_VERIFIED received (new streak starts)]
  ACTIVE   →  ACTIVE     [trigger: WORKOUT_VERIFIED (streak increments)]

Invalid transitions (rejected + logged):
  BROKEN   →  AT_RISK    [cannot go backwards]
  AT_RISK  →  AT_RISK    [no self-transition without event]
```

### 8.2 Workout State Machine

```
States: PENDING, VERIFIED, REJECTED

Transitions:
  PENDING   →  VERIFIED   [trigger: AI confidence >= 0.70]
  PENDING   →  REJECTED   [trigger: AI confidence < 0.70]
  REJECTED  →  PENDING    [trigger: user re-uploads / appeals]

Terminal states: VERIFIED, REJECTED (unless appealed)

Invalid transitions:
  VERIFIED  →  REJECTED   [verified is final]
  VERIFIED  →  PENDING    [no rollback]
```

### 8.3 Streak State Machine

```
States: INACTIVE, ACTIVE, BROKEN

Transitions:
  INACTIVE  →  ACTIVE   [trigger: first WORKOUT_VERIFIED]
  ACTIVE    →  ACTIVE   [trigger: WORKOUT_VERIFIED (increment counter)]
  ACTIVE    →  BROKEN   [trigger: 24h window missed]
  BROKEN    →  ACTIVE   [trigger: WORKOUT_VERIFIED (counter resets to 1)]

Counter rules:
  - Increments on ACTIVE → ACTIVE transition
  - Resets to 1 on BROKEN → ACTIVE transition
  - best = MAX(best, current) on every increment
```

---

## 9. RULE ENGINE

### 9.1 Rule Format

```typescript
interface Rule {
  id: string
  name: string
  description: string
  trigger: EventType          // Which event activates this rule
  condition: (event, context) => boolean  // When to fire
  actions: Action[]           // What to do
}
```

### 9.2 Rules Registry

| ID | Name | Trigger | Condition | Actions |
|----|------|---------|-----------|---------|
| R1 | Verify Workout | WORKOUT_UPLOADED | AI classification complete | If confidence >= 0.70: transition workout → VERIFIED |
| R2 | Reject Workout | WORKOUT_UPLOADED | AI classification complete | If confidence < 0.70: transition workout → REJECTED |
| R3 | Update Streak | WORKOUT_VERIFIED | Workout is verified | Transition streak ACTIVE→ACTIVE (increment) or BROKEN→ACTIVE (reset to 1) |
| R4 | Create Feed Post | WORKOUT_VERIFIED | Always | Create feed entry + publish to story |
| R5 | Risk Warning | CRON (20h check) | No workout in 20 hours | Transition user → AT_RISK, send notification |
| R6 | Break Streak | CRON (24h check) | No workout in 24 hours | Transition streak → BROKEN, user → BROKEN |
| R7 | Notify Friends | WORKOUT_VERIFIED | Has accepted friends | Send "X just posted" notification to friends |
| R8 | Snap Response | SNAP_RECEIVED | Recipient has active streak | No action (acknowledgment) |
| R9 | Welcome Flow | USER_SIGNED_UP | Always | Send welcome notification, create default streak row |

### 9.3 Rule Execution Order
1. Event arrives
2. All rules with matching trigger are collected
3. Rules evaluated in priority order (R1-R9)
4. Each rule's condition checked against current state
5. Actions dispatched (sync for state changes, async for notifications/feed)
6. If action fails: log error, do NOT retry state changes (idempotency risk)

---

## 10. AI CLASSIFICATION LAYER

### 10.1 Boundary (NON-NEGOTIABLE)

```
AI CAN:
  ✓ Receive an image
  ✓ Return a classification payload
  ✓ Be called by a worker

AI CANNOT:
  ✗ Write to database
  ✗ Trigger state transitions directly
  ✗ Override rule engine decisions
  ✗ Access streak data
  ✗ Access user data beyond the image
  ✗ Make decisions about streaks or feed ranking
```

### 10.2 Classification Payload

```typescript
interface AIClassification {
  isWorkout: boolean
  type: 'gym' | 'running' | 'cycling' | 'swimming' | 'outdoor' | 'sports' | 'other'
  confidence: number  // 0.00 - 1.00
  processingTimeMs: number
  modelVersion: string
}
```

### 10.3 Flow

```
WORKOUT_UPLOADED event
    → AI Worker picks up event
    → Sends image to AI provider (OpenAI Vision / Claude Vision)
    → Receives classification payload
    → Emits WORKOUT_VERIFIED or WORKOUT_REJECTED event
    → Rule engine picks up new event
    → State machine transitions execute
```

### 10.4 Failure Handling
- AI timeout (>10s): retry once, then mark PENDING with manual review flag
- AI unavailable: queue for retry with exponential backoff (max 3 attempts)
- AI returns ambiguous (confidence 0.50-0.70): mark PENDING, notify user
- All failures logged with correlation ID

---

## 11. FEED SYSTEM

### 11.1 Architecture

Feed is **computed, not stored** (MVP). Materialized feed cache added at scale.

### 11.2 Feed Query Pipeline

```
1. GET /api/feed?cursor=X&limit=20
2. Fetch user's accepted friend IDs (from friendships table)
3. Query posts WHERE userId IN friendIds AND status = 'VERIFIED'
4. Apply ranking score to each post
5. Sort by score DESC
6. Apply cursor-based pagination
7. Return posts with user data + streak info
```

### 11.3 Ranking Formula

```
score = recency_score * friend_affinity * (1 + streak_boost)

Where:
  recency_score = 1 / (1 + hours_since_post / 24)     // Decays over 24h
  friend_affinity = interaction_count / max_interactions  // 0.0 - 1.0
  streak_boost = MIN(streak_days / 100, 0.5)            // Max 50% boost
```

MVP simplification: `friend_affinity = 1.0` (all friends equal), `streak_boost = streak_days * 0.01`

### 11.4 Scaling Path
- MVP: Direct SQL query with indexes
- 10k DAU: Per-user feed cache (Redis) with TTL invalidation
- 100k DAU: Materialized feed table, async rebuild on new posts
- 1M+ DAU: Fan-out-on-write with dedicated feed service

---

## 12. STREAK ENGINE

### 12.1 Core Logic

```
Streak evaluation runs on TWO triggers:
  1. SYNC: When WORKOUT_VERIFIED event fires → immediate streak update
  2. CRON: Every hour, check all users for at-risk/broken streaks

Streak window: 24 hours from last verified workout (UTC)

Timeline:
  T+0h   : User posts workout → streak incremented
  T+20h  : No new workout → user state → AT_RISK, notification sent
  T+24h  : Still no workout → streak state → BROKEN, user state → BROKEN
```

### 12.2 Timezone Handling

- All timestamps stored in UTC
- Streak window = 24 hours from `lastVerifiedAt`, NOT calendar day
- User's display timezone stored in profile for notification scheduling
- Streak evaluation always runs in UTC

### 12.3 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Two workouts same day | Second ignored, streak stays same |
| Workout at 11:59 PM, next at 12:01 AM | Valid — within 24h window |
| AI processing takes 2 hours | Streak uses upload timestamp, not verification timestamp |
| User changes timezone | No effect — UTC window unchanged |
| Server downtime during evaluation | Cron catches up on next run, uses timestamps not wall clock |

---

## 13. NOTIFICATION SYSTEM

### 13.1 Architecture

Notifications are **event-driven behavioral infrastructure**, not UI features.

### 13.2 Notification Types

| Type | Trigger Event | Priority | Channel |
|------|--------------|----------|---------|
| STREAK_AT_RISK | User AT_RISK state | URGENT | Push + In-app |
| STREAK_BROKEN | Streak BROKEN state | HIGH | Push + In-app |
| WORKOUT_VERIFIED | WORKOUT_VERIFIED | NORMAL | In-app |
| FRIEND_POSTED | FEED_POST_CREATED | NORMAL | In-app |
| FRIEND_REQUEST | FRIEND_REQUEST_SENT | NORMAL | In-app |
| FRIEND_ACCEPTED | FRIEND_REQUEST_ACCEPTED | NORMAL | In-app |
| WELCOME | USER_SIGNED_UP | LOW | In-app |

### 13.3 Delivery Guarantees
- **Idempotency key:** `userId + eventType + DATE(timestamp)` — no duplicate per user per event type per day
- **Ordering:** Notifications delivered in timestamp order within a user's queue
- **Failure:** Failed deliveries retried 3x with exponential backoff, then marked FAILED

---

## 14. STORY SYSTEM (MVP)

### 14.1 Mechanic
- When a workout is VERIFIED, a story is automatically published
- Stories are visible to friends for 24 hours
- Stories appear at the top of the feed page (horizontal scroll)
- Stories are ephemeral — auto-deleted after 24h by cron job

### 14.2 Data Model
- Story is a **view** on the posts table: `WHERE status = 'VERIFIED' AND createdAt > NOW() - 24h`
- No separate stories table needed in MVP
- At scale: materialized story cache

---

## 15. FRIEND / SOCIAL GRAPH SYSTEM

### 15.1 Model
- Bidirectional friendships (both must accept)
- Friend request → pending → accepted / rejected
- Blocked users: no interaction possible (hidden from feed, no DMs, no friend requests)

### 15.2 Graph Queries (Critical Path)
- `getFriendIds(userId)` — used by feed, notifications, stories
- Must be fast: indexed on `(userAId, status)` and `(userBId, status)`
- MVP: direct SQL query
- Scale: cached friend list per user in Redis

---

## 16. MESSAGE SYSTEM (DM / SNAPS)

### 16.1 MVP Scope
- Friends-only messaging
- Text + image messages
- Message requests for non-friends (future)

### 16.2 Architecture
- REST API for send/receive (MVP)
- WebSocket/SSE for real-time delivery (post-MVP)
- Messages stored in `messages` table
- Media attachments stored in R2, referenced by URL

---

## 17. STORAGE PIPELINE

### 17.1 Upload Flow

```
1. Client requests signed upload URL (POST /api/uploads/sign)
2. Server generates pre-signed R2 URL (expires 5 min)
3. Client uploads directly to R2 (bypasses server)
4. Client confirms upload (POST /api/posts/create with R2 key)
5. Server validates: file exists in R2, size OK, MIME OK
6. Server strips EXIF metadata
7. Server creates post record with imageUrl
8. WORKOUT_UPLOADED event emitted
```

### 17.2 Security
- Signed URLs expire after 5 minutes
- Max file size: 10MB
- Allowed MIME: image/jpeg, image/png, image/webp
- EXIF stripped server-side before any public access
- File names randomized (CUID)
- No user-controlled file paths

---

## 18. API CONTRACTS (KEY ENDPOINTS)

### Auth
| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | /api/auth/signup | {email, username, password} | {user, session} | No |
| POST | /api/auth/login | {email, password} | {user, session} | No |
| POST | /api/auth/logout | — | {success} | Yes |
| GET | /api/auth/session | — | {user} or 401 | Yes |

### Posts / Workouts
| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | /api/uploads/sign | {mimeType, fileSize} | {uploadUrl, key} | Yes |
| POST | /api/posts/create | {imageKey, caption?} | {post} | Yes |
| GET | /api/posts/:id | — | {post} | Yes |

### Feed
| Method | Path | Query | Response | Auth |
|--------|------|-------|----------|------|
| GET | /api/feed | ?cursor=X&limit=20 | {posts[], nextCursor} | Yes |

### Streaks
| Method | Path | Response | Auth |
|--------|------|----------|------|
| GET | /api/streaks/me | {current, best, status, lastActive} | Yes |
| GET | /api/streaks/:userId | {current, best, status} | Yes |

### Friends
| Method | Path | Body | Response | Auth |
|--------|------|------|----------|------|
| POST | /api/friends/request | {targetUserId} | {friendship} | Yes |
| POST | /api/friends/accept | {friendshipId} | {friendship} | Yes |
| POST | /api/friends/remove | {friendshipId} | {success} | Yes |
| GET | /api/friends | — | {friends[]} | Yes |

### Notifications
| Method | Path | Response | Auth |
|--------|------|----------|------|
| GET | /api/notifications | {notifications[], unreadCount} | Yes |
| POST | /api/notifications/read | {notificationIds[]} | {success} | Yes |

---

## 19. DATABASE SCHEMA OVERVIEW

Core tables (details in DATA_MODEL.md):
- `users` — identity + profile
- `posts` — workout submissions (photo proof)
- `workouts` — AI classification results (linked to post)
- `streaks` — per-user streak state
- `friendships` — social graph
- `notifications` — in-app notifications
- `events` — append-only event log (system of record)
- `messages` — DMs (post-MVP)

---

## 20. DEPLOYMENT ARCHITECTURE

### 20.1 MVP Topology

```
GitHub (mono-repo)
    │
    ▼
Vercel (auto-deploy on push to main)
    ├── Next.js frontend (edge)
    ├── API routes (serverless functions)
    │
    ▼
Supabase
    ├── PostgreSQL (managed)
    ├── Auth (Supabase Auth)
    │
Cloudflare R2
    └── Object storage (images)
```

### 20.2 Environment Separation
- **dev** — local development (local Postgres via Docker)
- **staging** — Vercel preview deployments + staging DB
- **production** — Vercel production + production DB

### 20.3 CI/CD
- Push to `main` → auto-deploy to production
- Push to feature branch → preview deployment
- Required: all tests pass before merge
- Database migrations run as part of deploy

---

## 21. SCALING ROADMAP

| Stage | DAU | Changes |
|-------|-----|---------|
| MVP | 0–1k | Monolith on Vercel, direct DB queries |
| Growth | 1k–10k | Add Redis for feed cache + session store |
| Scale | 10k–100k | Extract notification worker, add BullMQ job queue |
| Expansion | 100k–1M | Read replicas, materialized feeds, CDN optimization |
| Platform | 1M+ | Service extraction (feed, notifications, AI), dedicated infra |

---

## 22. OBSERVABILITY

### MVP (Minimal Viable Observability)
- Structured JSON logging (every API request, event emission, state transition)
- Error tracking: Sentry (free tier)
- Uptime monitoring: Vercel analytics + UptimeRobot
- Key metrics to track from day 1:
  - API response times (p50, p95, p99)
  - Event processing lag
  - Streak evaluation accuracy (broken streaks that shouldn't be)
  - Upload success/failure rate
  - AI classification latency + confidence distribution

---

## 23. SECURITY ARCHITECTURE

(Full details in SECURITY.md)

Summary:
- All API routes authenticated by default (auth middleware)
- Session: HTTP-only secure cookies, rotating refresh tokens
- Passwords: argon2/bcrypt, never logged, never exposed
- Uploads: server-validated MIME + size, EXIF stripped, signed URLs
- Rate limiting: on auth endpoints (5/min), uploads (10/hr), general (100/min)
- RBAC: user / admin roles, backend-enforced
- AI agents: forbidden from bypassing auth, hardcoding secrets, or direct DB writes from frontend

---

## 24. AI AGENT ORCHESTRATION

(Full details in AGENT_RUNBOOK.md)

Summary:
- 5 agent roles: Architect, Backend, Frontend, QA, DevOps
- Strict vertical-slice execution: design → build → test → deploy → verify
- No agent crosses module boundaries
- QA agent is sole authority on PASS/FAIL
- All agents operate within contracts defined by Architect agent

---

## 25. CORE ARCHITECTURAL PRINCIPLES

1. **Events are truth** — if it's not in the event log, it didn't happen
2. **State machines are law** — no state change without a valid transition
3. **Rules are centralized** — no business logic hiding in controllers or frontend
4. **AI is read-only** — classification only, zero mutation authority
5. **Modules are isolated** — cross-module communication through services, never repos
6. **Simplicity first** — no infrastructure without proven need
7. **Deterministic behavior** — same events → same state, every time
8. **Beginner readable** — a new engineer (or AI agent) can understand any module in 10 minutes
