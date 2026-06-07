# CLAUDE.md — BeActive Project Bible

> **Last updated:** 2026-06-07 — MVP readiness fixes shipped. All pre-launch checklist items complete. ✅ MVP READY.
> **✅ PRE-LAUNCH CHECKLIST — ALL DONE:**
> 1. **R2 CORS** ✅ — Configured in Cloudflare dashboard. Verified live (preflight HTTP 204).
> 2. **Upstash Redis** ✅ — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set in Vercel. Rate limiting verified (429 on 6th request to /api/auth/login).
> 3. **Sentry** ✅ — `NEXT_PUBLIC_SENTRY_DSN` set in Vercel. Enabled production-only, 10% trace sample rate.
> **Purpose:** Master reference for Claude CLI/Code. Read this FIRST before every session.
> **Rule:** architecture.md wins all contradictions. This file is the index; the /docs/ files are the source of truth.

---

## 1. PROJECT OVERVIEW

**Name:** BeActive
**What:** A daily workout proof app with streaks, social accountability, and AI verification.
**One-liner:** "BeActive is where Strava meets BeReal — daily workout proof, social accountability, streak-powered retention."
**Platform:** Web-first (Next.js), mobile later (React Native).
**Stage:** Pre-seed / MVP build. Solo founder + AI-assisted engineering.
**Architecture:** Modular monolith + event-driven core + state machine enforcement.

### What This Is NOT
- Not a fitness tracker (no GPS, no reps, no calories)
- Not a social media app (no public feed, no followers, no algorithm)
- Not a Strava clone (no performance analytics)

### What This IS
- A daily social habit engine powered by streaks
- A behavioral accountability platform
- An event-driven system where AI classifies but never decides

---

## 2. TECH STACK (LOCKED — Do Not Change Without Strong Justification)

### Frontend
| Technology | Purpose |
|-----------|---------|
| Next.js 14+ (App Router) | Full-stack React framework, SSR, API routes |
| TypeScript | Type safety everywhere, strict mode |
| TailwindCSS | Utility-first CSS, no custom CSS files |
| Zustand | Client-side state management |
| TanStack Query | Server state, caching, background refresh |

### Backend
| Technology | Purpose |
|-----------|---------|
| Next.js API Routes | API layer (MVP), serverless on Vercel |
| Zod | Input validation on ALL endpoints, no exceptions |
| node-cron / BullMQ | Scheduled jobs (streak evaluation), async workers |

### Data
| Technology | Purpose |
|-----------|---------|
| PostgreSQL | Primary database (via Supabase managed) |
| Prisma | ORM, migrations, type-safe queries |
| Cloudflare R2 | Object storage for images (S3-compatible, zero egress) |

### Auth
| Technology | Purpose |
|-----------|---------|
| Supabase Auth | Email/password, OAuth (future), JWT management |
| HTTP-only secure cookies | Session storage (SameSite=Lax) |
| Rotating refresh tokens | Managed by Supabase |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| Vercel | Frontend + API hosting, auto-deploy on push to main |
| Supabase | Managed PostgreSQL + Auth |
| Sentry | Error tracking (free tier) |

### Testing
| Technology | Purpose |
|-----------|---------|
| Vitest | Unit + integration tests |
| Playwright | E2E browser tests |

---

## 3. DEVELOPMENT COMMANDS

```bash
# Development
npm run dev                    # Start Next.js dev server (localhost:3000)
npm run build                  # Production build
npm run lint                   # ESLint + TypeScript check
npm run type-check             # TypeScript only

# Database
npx prisma generate            # Regenerate Prisma client after schema changes
npx prisma migrate dev          # Create + apply migration (dev only)
npx prisma migrate deploy       # Apply pending migrations (staging/prod)
npx prisma studio               # Visual DB browser (dev only)
npx prisma db seed              # Seed test data (if seed script exists)

# Testing
npm run test                    # Run all unit tests (Vitest)
npm run test:integration        # Run integration tests against test DB
npm run test:e2e                # Run Playwright E2E tests
npm run test:watch              # Watch mode for unit tests

# Deployment
git push origin main            # Auto-deploys to Vercel production
# Feature branches auto-deploy to Vercel preview URLs
```

---

## 4. PROJECT STRUCTURE

```
/BeActive
├── apps/
│   └── web/                          # Next.js frontend
│       ├── app/                      # App Router pages
│       │   ├── (auth)/               # Auth group: /login, /signup
│       │   ├── (main)/               # Authenticated group: /feed, /profile, /upload
│       │   └── api/                  # API routes (thin controllers)
│       │       ├── auth/
│       │       ├── feed/
│       │       ├── friends/
│       │       ├── notifications/
│       │       ├── posts/
│       │       ├── streaks/
│       │       ├── uploads/
│       │       └── users/
│       ├── components/
│       │   ├── ui/                   # Design system primitives (Button, Input, Card)
│       │   ├── features/             # Feature-specific (FeedCard, StreakBadge, UploadPreview)
│       │   └── layouts/              # Page layouts (MainLayout, AuthLayout)
│       ├── hooks/                    # Custom React hooks (useAuth, useFeed, useStreak)
│       ├── lib/                      # Client utilities (api client, formatters)
│       └── styles/                   # Global styles (globals.css with Tailwind)
│
├── server/                           # Backend domain logic
│   ├── core/                         # System primitives (shared infrastructure)
│   │   ├── events/
│   │   │   ├── bus.ts                # EventEmitter singleton
│   │   │   ├── types.ts             # All event type definitions (EventType enum)
│   │   │   └── handlers.ts          # Event → handler registry
│   │   ├── rules/
│   │   │   ├── engine.ts            # Rule evaluation engine
│   │   │   ├── registry.ts          # All 9 rules registered here (R1-R9)
│   │   │   └── types.ts             # Rule type definitions
│   │   ├── state-machines/
│   │   │   ├── user.machine.ts      # ACTIVE → AT_RISK → BROKEN
│   │   │   ├── workout.machine.ts   # PENDING → VERIFIED / REJECTED
│   │   │   └── streak.machine.ts    # INACTIVE → ACTIVE → BROKEN
│   │   ├── middleware/
│   │   │   ├── auth.ts              # Auth guard (validates Supabase session)
│   │   │   ├── rateLimit.ts         # Per-endpoint rate limiting
│   │   │   └── validate.ts          # Zod validation middleware wrapper
│   │   ├── errors/
│   │   │   └── AppError.ts          # Structured error classes (ValidationError, NotFoundError, etc.)
│   │   └── logger/
│   │       └── index.ts             # Structured JSON logging
│   │
│   ├── modules/                      # Domain modules (each self-contained)
│   │   ├── auth/
│   │   │   ├── auth.controller.ts   # Route handlers for /api/auth/*
│   │   │   ├── auth.service.ts      # Signup, login, logout, session logic
│   │   │   ├── auth.repo.ts         # User queries (Prisma)
│   │   │   ├── auth.schema.ts       # Zod schemas (signupSchema, loginSchema)
│   │   │   └── auth.types.ts        # Module-internal TypeScript types
│   │   ├── users/                    # Same structure as auth
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
│       ├── streakEvaluator.ts        # Cron (hourly): check at-risk/broken streaks
│       ├── aiClassifier.ts           # Process WORKOUT_UPLOADED → classify image
│       ├── notificationDispatcher.ts # Deliver notifications from events
│       └── feedIndexer.ts            # Rebuild feed caches (future)
│
├── shared/                           # Cross-boundary types (imported by both frontend + backend)
│   ├── types/                        # API request/response TypeScript types
│   ├── constants/                    # Enums, magic numbers, thresholds
│   └── utils/                        # Pure utility functions (no side effects)
│
├── prisma/
│   ├── schema.prisma                 # THE database schema (source of truth)
│   └── migrations/                   # Prisma migration history
│
├── tests/
│   ├── unit/                         # Vitest unit tests (mocked deps)
│   ├── integration/                  # Vitest + real test DB
│   └── e2e/                          # Playwright browser tests
│
├── docs/                             # Architecture documentation (the engineering brain)
│   ├── architecture.md               # MASTER REFERENCE — wins all contradictions
│   ├── data_model.md                 # Database schema, relationships, indexes
│   ├── context.md                    # Product vision, target users, competitive positioning
│   ├── goals.md                      # Vertical slices 0-9, execution order
│   ├── memory.md                     # Locked decisions, resolved debates, anti-patterns
│   ├── security.md                   # Auth, RBAC, upload security, secrets
│   ├── agent_runbook.md              # AI agent execution protocol
│   ├── EVENT_CATALOG.md              # Every event: type, source, payload, consumers
│   ├── STATE_MACHINE_REGISTRY.md     # Every state machine: states, transitions, invalid transitions
│   ├── RULE_REGISTRY.md              # Every business rule: R1-R9, trigger, condition, action
│   ├── API_CONTRACTS.md              # Every endpoint: request/response shapes, errors
│   ├── STREAK_ENGINE.md              # Streak system v1 (rolling 24h) — SUPERSEDED, see V2
│   ├── STREAK_ENGINE_V2.md           # Streak system v2 (calendar-day) — APPROVED, pending impl
│   ├── AI_BOUNDARY.md                # What AI can/cannot do (the locked box)
│   ├── FAILURE_MODES.md              # Every failure scenario + recovery
│   ├── TESTING_STRATEGY.md           # What to test, critical test cases
│   └── ENGINEERING_PRINCIPLES.md     # The 10 principles that guide all decisions
│
├── infra/
│   ├── docker/                       # Docker Compose for local dev (Postgres)
│   └── scripts/                      # Utility scripts (seed, cleanup, etc.)
│
├── .env.example                      # Template for environment variables
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
├── vitest.config.ts
├── playwright.config.ts
├── CLAUDE.md                         # THIS FILE — read first every session
└── README.md
```

---

## 5. CODE CONVENTIONS

### Naming Conventions
| Context | Convention | Example |
|---------|-----------|---------|
| Module files | `module.role.ts` | `auth.service.ts`, `posts.repo.ts`, `streaks.schema.ts` |
| Database tables | PascalCase (Prisma models) | `User`, `Post`, `Streak`, `Friendship` |
| Database columns | camelCase | `userId`, `createdAt`, `lastVerifiedAt` |
| API routes | kebab-case | `/api/auth/signup`, `/api/friends/request` |
| Event types | SCREAMING_SNAKE_CASE | `WORKOUT_VERIFIED`, `STREAK_BROKEN` |
| Enums | SCREAMING_SNAKE_CASE | `PENDING`, `ACTIVE`, `GYM` |
| Environment variables | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `SUPABASE_SERVICE_KEY` |
| React components | PascalCase files + exports | `FeedCard.tsx`, `StreakBadge.tsx` |
| React hooks | `use` prefix, camelCase | `useAuth.ts`, `useFeed.ts` |
| TypeScript types/interfaces | PascalCase | `CreatePostRequest`, `FeedPostResponse` |
| Zod schemas | camelCase with Schema suffix | `signupSchema`, `createPostSchema` |
| CSS | Tailwind utility classes only | `className="flex items-center gap-2"` |

### File Organization
**Feature-based modules** in `/server/modules/`. Each module is self-contained:
```
module/
  module.controller.ts    # Route handler — thin, delegates to service
  module.service.ts       # Business logic — emits events, calls rules
  module.repo.ts          # Database queries — Prisma only, no logic
  module.schema.ts        # Zod validation schemas for this module
  module.types.ts         # Module-internal TypeScript types
```

### Import Order
```typescript
// 1. Node built-ins
import { randomUUID } from 'crypto'

// 2. External packages
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

// 3. Internal shared
import { EventType } from '@/shared/constants'
import { CreatePostRequest } from '@/shared/types'

// 4. Internal core
import { eventBus } from '@/server/core/events/bus'
import { ruleEngine } from '@/server/core/rules/engine'

// 5. Same module (relative)
import { postsRepo } from './posts.repo'
import { createPostSchema } from './posts.schema'
```

### TypeScript Rules
- `strict: true` in tsconfig.json (no exceptions)
- Explicit return types on all service and repo functions
- No `any` — use `unknown` and narrow with type guards
- All API request/response types defined in `/shared/types/`
- Zod schemas as the single source of validation truth (infer types from schemas)

### State Management
- **Server state:** TanStack Query (React Query) — all API data, caching, background refresh
- **Client state:** Zustand — UI state only (modals, selected tabs, form state)
- **Auth state:** Zustand store hydrated from `/api/auth/session` on page load
- **NO Redux** — unnecessary complexity for this app
- **NO React Context for data** — only for theme/layout concerns

---

## 6. WHAT TO AVOID (CRITICAL — Read Every Session)

### Architecture Anti-Patterns
- **DO NOT** put business logic in controllers — controllers parse request → call service → return response. That's it.
- **DO NOT** put business logic in frontend — frontend calls APIs, displays data, handles UI state. Zero business logic.
- **DO NOT** put business logic in repos — repos are Prisma queries. No if/else, no event emission, no rule evaluation.
- **DO NOT** import another module's repo — cross-module calls go through services only (`service → other.service`, never `service → other.repo`).
- **DO NOT** call repos from controllers directly — always go through the service layer.

### Event System
- **DO NOT** skip event emission — every state change MUST emit an event.
- **DO NOT** create events without registering in EVENT_CATALOG.md first.
- **DO NOT** update or delete rows in the `events` table — it is append-only, immutable.
- **DO NOT** put business logic in event handlers — handlers should call rules/services, not contain logic.

### State Machines
- **DO NOT** modify streak/workout/user state directly — always go through the state machine.
- **DO NOT** skip state machine validation — if the transition isn't in STATE_MACHINE_REGISTRY.md, it's invalid.
- **DO NOT** add new states without architect approval and updating the registry.

### AI Boundary (NON-NEGOTIABLE)
- **DO NOT** let AI write to any database table.
- **DO NOT** let AI trigger state transitions.
- **DO NOT** let AI access user data, streak data, friend data.
- **DO NOT** let AI decide whether a streak should increment — that's the rule engine's job.
- AI is a classifier only: image in → `{ isWorkout, type, confidence }` out.

### Auth & Security
- **DO NOT** store auth tokens in localStorage or sessionStorage — HTTP-only cookies only.
- **DO NOT** trust client-side validation alone — Zod validation on every endpoint, server-side.
- **DO NOT** hardcode secrets or credentials — `.env` only, never committed.
- **DO NOT** expose internal database IDs, stack traces, or SQL errors in API responses.
- **DO NOT** skip auth middleware on any mutation endpoint (except signup/login).
- **DO NOT** commit `.env` files — use `.env.example` with placeholder values.

### Database
- **DO NOT** write raw SQL without checking data_model.md first.
- **DO NOT** create tables or columns without architect approval.
- **DO NOT** use offset pagination — cursor-based only (feed, notifications).
- **DO NOT** run `prisma migrate` in production without review.
- **DO NOT** trust client-provided file metadata (MIME type, file extension) — validate server-side.

### Frontend
- **DO NOT** access the database from frontend code.
- **DO NOT** duplicate backend logic in the frontend.
- **DO NOT** use `localStorage` for any auth data.
- **DO NOT** skip loading, error, and empty states in UI components.

---

## 7. CORE LOGIC REMINDERS

### The 5 System Primitives
Every feature decomposes into these:
1. **Event System** — records what happened (immutable, append-only, replayable)
2. **State Machines** — enforces what can exist (valid transitions only)
3. **Rule Engine** — decides what should happen (centralized IF/THEN, R1-R9)
4. **AI Layer** — classifies images (read-only, zero write access)
5. **Execution Services** — performs actions (thin wrappers, no decisions)

### Request Flow
```
Client → API (auth + validate + rate limit) → Controller → Service → Event Emitter
    → Rule Engine → State Machine → Database → Async Workers (notifications, AI, feed)
```

### Streak Rules (CRITICAL — This Is The Product)
- **Window:** Rolling 24 hours from `lastVerifiedAt` (UTC, NOT calendar day)
- **Increment:** On WORKOUT_VERIFIED, if within 24h window → `current += 1`
- **Reset:** On WORKOUT_VERIFIED after break → `current = 1` (fresh start)
- **At-risk:** Cron at 20h since lastVerifiedAt → user → AT_RISK, notification sent
- **Break:** Cron at 24h since lastVerifiedAt → streak → BROKEN
- **Best:** `best = MAX(best, current)` on every update
- **Same-day:** Second workout same day → ignored (no double increment)
- **AI latency:** Streak uses `post.createdAt`, NOT `workout.processedAt`

### AI Classification
- **Input:** image URL + post ID
- **Output:** `{ isWorkout: boolean, type: string, confidence: number, processingTimeMs: number, modelVersion: string }`
- **Threshold:** confidence ≥ 0.70 → VERIFIED, < 0.70 → REJECTED, 0.50-0.69 → PENDING (ambiguous)
- **Failure:** retry 3x with exponential backoff, then mark PENDING + manual review flag

### Feed Ranking
```
score = recency_score * (1 + streak_boost)

recency_score = 1 / (1 + hours_since_post / 24)
streak_boost = MIN(streak_days / 100, 0.5)
```
MVP simplification: `friend_affinity = 1.0` (all friends equal).

### Business Rules (R1-R9)
| Rule | Trigger | Action |
|------|---------|--------|
| R1 | AI confidence ≥ 0.70 | Post → VERIFIED, emit WORKOUT_VERIFIED |
| R2 | AI confidence < 0.70 | Post → REJECTED, emit WORKOUT_REJECTED |
| R3 | WORKOUT_VERIFIED | Increment/restart streak, emit STREAK_UPDATED |
| R4 | WORKOUT_VERIFIED | Create feed post + publish story |
| R5 | Cron: 20h gap | User → AT_RISK, send urgent notification |
| R6 | Cron: 24h gap | Streak → BROKEN, notify user |
| R7 | WORKOUT_VERIFIED | Notify each friend |
| R8 | FRIEND_REQUEST_ACCEPTED | Notify both users, enable feed visibility |
| R9 | USER_SIGNED_UP | Create default streak (INACTIVE), send welcome |

### State Machines
**User Activity:** `ACTIVE → AT_RISK (20h) → BROKEN (24h) → ACTIVE (new workout)`
**Workout:** `PENDING → VERIFIED (≥0.70) or REJECTED (<0.70)`
**Streak:** `INACTIVE → ACTIVE (first workout) → BROKEN (24h missed) → ACTIVE (new workout, count=1)`

---

## 8. ENVIRONMENT VARIABLES

```bash
# Database
DATABASE_URL="postgresql://..."          # Supabase Postgres connection string

# Supabase Auth
SUPABASE_URL="https://xxx.supabase.co"   # Supabase project URL
SUPABASE_ANON_KEY="eyJ..."               # Public key (safe for client-side)
SUPABASE_SERVICE_KEY="eyJ..."            # Service key (SERVER-ONLY, NEVER expose to client)

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID="..."                   # R2 access key
R2_SECRET_ACCESS_KEY="..."              # R2 secret key
R2_BUCKET_NAME="beactive-uploads"        # R2 bucket name
R2_PUBLIC_URL="https://..."              # R2 CDN URL for serving images
R2_ENDPOINT="https://xxx.r2.cloudflarestorage.com"  # R2 endpoint

# AI Classification
AI_PROVIDER="gemini"                     # "gemini" (default) or "claude"
GEMINI_API_KEY="..."                     # Gemini API key — free at aistudio.google.com/apikey
# AI_API_KEY="sk-ant-..."               # Anthropic key — only if AI_PROVIDER=claude
# HF_API_KEY is no longer used (HF SDK v4 removed CLIP from inference provider mapping)

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # App URL (NEXT_PUBLIC_ prefix = client-accessible)
NEXT_PUBLIC_STREAK_DEBUG="true"      # Dev only — enables StreakDebugPanel on /feed. Never set in production.
```

**Security rules:**
- `.env` files NEVER committed to git (in `.gitignore`)
- `.env.example` committed with placeholder values
- `SUPABASE_SERVICE_KEY` is server-only — NEVER prefix with `NEXT_PUBLIC_`
- `AI_API_KEY` is server-only — NEVER prefix with `NEXT_PUBLIC_`
- Vercel environment variables for staging/production

---

## 9. API ENDPOINTS (Quick Reference)

### Auth (no auth required on signup/login)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/signup` | Create account (3/min rate limit) |
| POST | `/api/auth/login` | Login (5/min rate limit) |
| POST | `/api/auth/logout` | Logout (invalidate session) |
| GET | `/api/auth/session` | Get current user or 401 |

### Upload + Posts (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/uploads/sign` | Get pre-signed R2 URL (10/hr) |
| POST | `/api/posts/create` | Create post from uploaded image (5/hr) |
| GET | `/api/posts/:id` | Get single post with workout data |

### Feed (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/feed?cursor=X&limit=20` | Ranked feed from friends |

### Streaks (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/streaks/me` | Own streak (current, best, status) |
| GET | `/api/streaks/:userId` | Friend's public streak |

### Friends (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/friends/request` | Send friend request |
| POST | `/api/friends/accept` | Accept friend request |
| POST | `/api/friends/reject` | Reject friend request |
| POST | `/api/friends/remove` | Remove friendship |
| GET | `/api/friends` | List accepted friends |
| GET | `/api/friends/pending` | List incoming + outgoing requests |
| GET | `/api/users/search?q=X` | Search users by username |

### Notifications (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/notifications?cursor=X` | Paginated notifications + unread count |
| POST | `/api/notifications/read` | Mark notifications as read |

### Profile (auth required)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/users/me` | Full profile |
| PATCH | `/api/users/me` | Update profile fields |

**Full request/response shapes → see `/docs/API_CONTRACTS.md`**

---

## 10. DATABASE SCHEMA (Quick Reference)

### Tables
| Table | Owner Module | Key Fields |
|-------|-------------|------------|
| `User` | auth, users | id, email, username, activityState [ACTIVE\|AT_RISK\|BROKEN], role [USER\|ADMIN] |
| `Post` | posts | id, userId, imageUrl, imageKey, caption, status [PENDING\|VERIFIED\|REJECTED] |
| `Workout` | workouts, ai | id, postId (unique), type [GYM\|RUNNING\|...], aiConfidence, modelVersion |
| `Streak` | streaks | id, userId (unique), current, best, status [INACTIVE\|ACTIVE\|BROKEN], lastVerifiedAt |
| `Friendship` | friends | id, userAId, userBId, status [PENDING\|ACCEPTED\|BLOCKED], unique(userAId, userBId) |
| `Notification` | notifications | id, userId, type, title, body, data (JSON), read, idempotencyKey (unique) |
| `Event` | core/events | id, type, userId, payload (JSON), source, correlationId — **APPEND-ONLY** |
| `Message` | messages | id, senderId, receiverId, content, imageUrl — **Post-MVP** |

### Critical Constraints
- One streak per user (`userId` unique on Streak)
- One workout per post (`postId` unique on Workout)
- No duplicate friendships (`@@unique([userAId, userBId])`)
- No self-friendships (service layer enforced)
- Events table: NEVER update or delete rows
- passwordHash NOT in our schema (managed by Supabase Auth)

**Full schema with Prisma definitions → see `/docs/data_model.md`**

---

## 11. EXECUTION ROADMAP (Current State)

### Vertical Slices (Build in this order)
| # | Slice | Status | Dependency |
|---|-------|--------|-----------|
| 0 | Project Scaffold | ✅ COMPLETE | None |
| 1 | Authentication | ✅ COMPLETE | Slice 0 |
| 2 | Upload & Post | ✅ COMPLETE | Slice 1 |
| 3 | AI Classification | ✅ COMPLETE | Slice 2 |
| 4 | Streak Engine | ✅ COMPLETE — QA 8/8 PASS (2026-06-01) | Slice 3 |
| 5 | Social Feed | ✅ COMPLETE — Phases A–F done (2026-06-03) | Slice 4 + 6 |
| 6 | Friends System | ✅ COMPLETE — merged to master (PR #3, 2026-06-05) | Slice 1 |
| 8A | Profiles + Post-Visibility Security | ✅ COMPLETE — merged to master (PR #4, 2026-06-05) | Slice 6 |
| 8B | Post Engagement (Likes + Comments + Share) | ✅ COMPLETE — merged to master (PR #6+#7, 2026-06-05) | Slice 8A |
| 7 | Notifications | ✅ COMPLETE — shipped + production-verified (2026-06-07) | Slice 4 + 6 |
| 8D | Share (profile link) | ✅ COMPLETE — merged to master (2026-06-07) | Slice 8B |
| 8C | Comments v2 | NOT STARTED (architecture prepped) | Slice 8B |
| 8 | Stories | NOT STARTED | Slice 5 (post-MVP) |
| 9 | DM System | NOT STARTED | Slice 6 (post-MVP) |

**Slices 5 and 6 can be built in parallel.** Feed needs friends, but friends can be built independently.

**Scope details for each slice → see `/docs/goals.md`**

---

## 12. FEATURE SPEC TEMPLATE (Required Before Any Implementation)

Before writing ANY code for a new feature, fill out this template:

```
FEATURE: [name]
MODULE: [/server/modules/X]
SLICE: [which vertical slice from goals.md]

ENDPOINTS:
  - METHOD /path → { request body } → { response }

DB CHANGES:
  - New tables/columns/indexes needed

EVENTS EMITTED:
  - EVENT_NAME → { payload shape }

STATE TRANSITIONS:
  - StateMachine: STATE_A → STATE_B [trigger]

RULES TRIGGERED:
  - Rule ID: condition → action

AI INVOLVEMENT:
  - None / Classification input / Classification output

VALIDATION RULES:
  - Field: constraint (Zod schema)

EDGE CASES:
  - Scenario → expected behavior

FAILURE MODES:
  - What can go wrong → how we handle it

DEFINITION OF DONE:
  - Specific testable criteria
```

---

## 13. MODULE COMMUNICATION RULES

```
ALLOWED:
  controller → own service
  service → own repo
  service → other module's service (via import)
  service → core/events (emit events)
  service → core/rules (evaluate rules)
  service → core/state-machines (request transitions)

FORBIDDEN:
  controller → any repo directly
  service → other module's repo
  frontend → any repo
  frontend → any service directly
  repo → another repo
  repo → event bus
  controller → business logic
```

---

## 14. ERROR HANDLING

### Standard Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "email", "message": "Required" }]
  }
}
```

### Error Codes
| Code | HTTP | When |
|------|------|------|
| VALIDATION_ERROR | 400 | Zod validation failed |
| UNAUTHORIZED | 401 | No valid session |
| FORBIDDEN | 403 | Authenticated but wrong permissions |
| NOT_FOUND | 404 | Resource doesn't exist |
| CONFLICT | 409 | Duplicate (username taken, duplicate friend request) |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unexpected error (NEVER expose details) |

### Error Class Pattern
```typescript
// server/core/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: unknown[]
  ) {
    super(message)
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown[]) {
    super('VALIDATION_ERROR', 400, 'Validation failed', details)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', 404, `${resource} not found`)
  }
}
```

---

## 15. DEBUGGING PROTOCOL

When something fails, check in this exact order:

1. **API contract** — does the request match the Zod schema?
2. **Validation layer** — is Zod rejecting valid input?
3. **Auth middleware** — is the session valid? Cookie present?
4. **Service layer** — is the business logic correct?
5. **Rule engine** — are the right rules firing? Check conditions.
6. **State machine** — is the transition valid from the current state?
7. **Repository** — is the Prisma query correct?
8. **Database** — is the data in the expected state? Check with Prisma Studio.
9. **Frontend** — is the state management (Zustand/TanStack Query) correct?

**No guessing. Verify each layer systematically.**

---

## 16. HOW CLAUDE SHOULD USE THIS FILE

### At the start of every session:
1. Read this file (`CLAUDE.md`)
2. Read `/docs/architecture.md` (master reference)
3. Read the specific docs for the current task:
   - Building a feature? → `goals.md` (scope) + `API_CONTRACTS.md` (endpoints)
   - Database work? → `data_model.md`
   - Streak logic? → `STREAK_ENGINE_V2.md` (calendar-day, current direction) + `STATE_MACHINE_REGISTRY.md` (`STREAK_ENGINE.md` = v1 rolling, superseded)
   - Event handling? → `EVENT_CATALOG.md` + `RULE_REGISTRY.md`
   - Security concern? → `security.md`

### Before writing code:
1. Confirm the feature is in scope for the current slice (`goals.md`)
2. Fill out the feature spec template (section 12 above)
3. Check `data_model.md` for table names and relationships
4. Check `STATE_MACHINE_REGISTRY.md` for valid transitions
5. Check `EVENT_CATALOG.md` for events to emit/consume
6. Check `API_CONTRACTS.md` for request/response shapes

### Before writing a query:
1. Check `data_model.md` for the correct table, column names, and indexes
2. Use Prisma — no raw SQL without explicit review

### Before adding business logic:
1. Check `RULE_REGISTRY.md` — does a rule already cover this?
2. Check `STATE_MACHINE_REGISTRY.md` — is this a state transition?
3. Business logic goes in service layer, never in controllers/repos/frontend

### Conflict resolution:
- `architecture.md` wins all contradictions
- `data_model.md` is truth for database schema
- `API_CONTRACTS.md` is truth for endpoint shapes
- `memory.md` is truth for resolved decisions (don't re-debate)

---

## 17. FILE UPDATE INSTRUCTIONS

**Claude must update this `CLAUDE.md` file** whenever:

- A new permanent decision is made → add to section 2 (Tech Stack) or Notes
- A slice status changes → update section 11 (Execution Roadmap)
- A new command or script is created → update section 3 (Development Commands)
- A bug requires a specific fix pattern → add to Notes / Gotchas
- A new anti-pattern is discovered → add to section 6 (What to Avoid)
- A new environment variable is added → update section 8
- A successful pattern emerges → add to a "Best Practices" section

**Trigger phrase:** When encountering important information, think: *"This should go in CLAUDE.md"* and update the file.

The goal is for this file to grow from a project blueprint into a comprehensive project bible over time.

---

## 18. NOTES / GOTCHAS

### Known Constraints
- **React Strict Mode is ON by default in Next.js 16 dev.** Effect cleanups run after the initial mount (double-invoke). Never pass a component-managed `URL.createObjectURL` result into an async function that creates a `new Image()` — the URL may be revoked before the image loads. Pattern: create + revoke inside the function itself (see `getCroppedBlob`, `stripExif`).
- Vercel serverless function timeout: 10s (free), 60s (pro) — AI classification MUST be async
- Supabase free tier: 500MB database, 1GB storage, 50k auth users
- R2 free tier: 10GB storage, 10M reads/month, 1M writes/month
- One VERIFIED post per user per UTC day (enforced in posts.service)
- R2 CORS bucket policy must be configured before production launch (upload works locally, not from production domain without CORS headers)

### QA Commands
```bash
# Streak Engine full QA (T1–T7, uses fresh throwaway account, cleans up after)
node --env-file=app/web/.env.local qa-streak.mjs
# Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET, R2 creds in .env.local
# Dev server must be running first (npm run dev)

# Friends (Slice 6) happy-path smoke — two real users, live server + real DB (25 checks)
node --env-file=app/web/.env.local qa-friends.mjs

# Interactions (Slice 8B) smoke — engagement + profile post shape + avatar set/remove (22 checks)
node --env-file=app/web/.env.local qa-interactions.mjs
# Covers view-gate, like idempotency, unlike, comments, feed counts, non-friend 404,
# self-like, comment validation, avatar ownership + remove.
# Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, DATABASE_URL in .env.local; dev server running.
# Covers search→request→accept→list→remove→cancel→block→unblock + self-op/auth guards.
# Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, DATABASE_URL in .env.local; dev server running.
# Caught the unapplied add_timezone_throttle migration drift (2026-06-04). Manual runner, not in `npm test`.

# v2 Phase 0 — Timezone readiness audit (Phase 0 DoD: "Invalid" count = 0)
npm run audit:timezones
# Requires: DATABASE_URL in app/web/.env.local (uses Prisma directly, no dev server needed)

# v2 Phase 3 — Backfill historical DailyCompletion rows + recompute Streak projections
npm run backfill:completions
# Safe to re-run — idempotent. Run once after deploying Phase 2 to production.

# v2 Phase 3 — Parity validation (Phase 3 DoD: exits 0 with 0 diverged rows)
npm run validate:parity
# Run AFTER backfill:completions. Read-only, never writes.
```

### Completed Slice Notes
- **Slice 2 (Upload):** EXIF stripped client-side via canvas; same-day guard at POST /api/posts/create (not at sign endpoint); R2 upload uses XHR for progress events
- **Slice 3 (AI):** HuggingFace CLIP dropped — use `AI_PROVIDER=gemini` (default) or `AI_PROVIDER=claude`; gemini-2.5-flash-lite model; confidence ≥ 0.70 = VERIFIED
- **Slice 4 (Streaks):** Rolling 24h UTC window from lastVerifiedAt; cron at /api/cron/streak-evaluator; AT_RISK at 20h, BROKEN at 24h; useStreak hook with staleTime=30s; upload page invalidates ['streak','me'] on VERIFIED
- **v2 Phase 0 (TZ Readiness):** `User.timezone` enforced IANA at onboarding (browser auto-detected, user-editable); `/api/users/me` GET+PATCH built; `users` module schema/repo/service/controller scaffolded; `AuthUser` type now includes `timezone`; audit script at `scripts/audit-timezones.mjs`
- **v2 Phase 1 (Ledger + pure engine):** `DailyCompletion` table added (migration `20260601113359`); `Streak.lastVerifiedDate String?` added; `recomputeStreak(ledger, tz, now)` pure function in `server/modules/streaks/recomputeStreak.ts`; `deriveDisplayTier()`, `toLocalDateStr()`, `getLocalHour()` exported from same file; 53 tests in `tests/unit/streaks/recomputeStreak.test.ts` — all pass; DoD: PASS
- **v2 Phase 2 (Write path):** `onWorkoutVerified` in `streaks.service.ts` now: (1) calls `getUserTimezone` + `createDailyCompletion` (P2002 idempotency gate replaces UTC same-day guard); (2) fetches full ledger via `getCompletionsForUser`; (3) calls `recomputeStreak` to get projection; (4) writes full v2 result (`current`, `best`, `status`, `lastVerifiedDate`) + `lastVerifiedAt` (kept for cron compat); injectable `_now` param for test clock control; 245 tests pass; DoD: PASS
- **v2 Phase 3 (Backfill + shadow):** `scripts/backfill-completions.mjs` — idempotent, creates DailyCompletion rows for all VERIFIED posts without one, then recomputes + updates every affected Streak projection; `scripts/validate-streak-parity.mjs` — read-only DoD gate, recomputes all users from ledger and compares against stored values, exits 1 on any divergence; npm scripts `backfill:completions` + `validate:parity`; 11 new unit tests (phase3Parity.test.ts) for parity comparison logic; 256 tests pass; DoD: run `npm run backfill:completions` then `npm run validate:parity` — exit 0 = PASS
- **v2 Phase 4+5 (Read cutover + UI swap):** `StreakResponse` now returns `{ current, best, status, lastVerifiedDate, completedToday, displayTier }` — no `nextDeadline`/`atRiskAt`/`lastVerifiedAt`; `getMyStreak` fetches tz + calls `hasDailyCompletion` + `deriveDisplayTier`; `StreakWidget` rewritten with tier-based display (5 configs for all DisplayTier values, no countdown); `StreakDebugPanel` updated for v2 fields; `useStreak.ts` StreakData updated; 257 tests pass; DoD: API returns v2 shape, no timer digits in UI
- **v2 Phase 6+7 (Cron repurpose + full cleanup):** `streakEvaluator.ts` rewritten — uses `lastVerifiedDate` + user tz + `hasDailyCompletion` + `recomputeStreak` guard; no more `lastVerifiedAt`/`activityState`; AT_RISK fires when past EVENING_HOUR + no completion today; BROKEN confirmed via recompute to guard races; schema migration `20260601200000_drop_v1_streak_fields` drops `Streak.lastVerifiedAt`, `User.activityState`, `UserActivityState` enum; `user.machine.ts` deleted; `useStreakTimer.ts` deleted; `setActivityState` removed; `auth.repo.ts` simplified (USER_SELECT const); `activityState` removed from all types/routes/tests; 238 tests pass; DoD: full suite green, rolling-24h code gone
- **Slice 5 (Social Feed):** Pull/read model — no materialized table, no event handler; two queries per page (friends + posts); frozen T0 cursor for stable pagination; `FEED_WINDOW_DAYS=30`, `FEED_CANDIDATE_CAP=500`; `friends.service.getAcceptedFriendIds` (two-arm OR query on symmetric Friendship row); `feed.ranking.ts` + `feed.cursor.ts` are pure functions (base64url cursor, `(score DESC, id ASC)` total order); `feed.service.getFeed` orchestrates with `_now` injection for tests; `GET /api/feed?cursor&limit` via `feed.controller.ts` + `app/web/app/api/feed/route.ts`; `useFeed` hook (`useInfiniteQuery`, `queryKey: ['feed']`, `staleTime: 60s`); `FeedCard.tsx` (null-safe avatar/caption, relative time, workout badge, streak display); feed page has IntersectionObserver infinite scroll + two empty states (NO_CONNECTIONS / NO_RECENT_ACTIVITY) + skeleton/error states; upload page invalidates `['feed']` on VERIFIED alongside `['streak','me']`; pre-existing `users.repo.ts` TS error (tzChangedAt columns absent from schema) — not introduced by Slice 5, still outstanding (blocks a fully-green repo-wide `type-check`; users-module/v2 owner to resolve)
- **Slice 5 hardening review (2026-06-03):** Principal-engineer review pass. (1) `feed.service` `emptyReason` now gated on `cursor === null` (first-page-only per §4/§9) so a forged/replayed deep cursor can't emit a misleading NO_CONNECTIONS; (2) added the two §12-mandated integration tests `tests/integration/feed-isolation.test.ts` (author-set enforcement, forged-cursor can't widen, field whitelist) + `tests/integration/feed-pagination.test.ts` (stitch/no-dupe/no-gap + FEED_CANDIDATE_CAP bounded truncation), faithful in-memory repo fakes driving the real getFeed pipeline; (3) added `tests/unit/feed/feed.repo.test.ts` (real VERIFIED/window/cap/select query shape — backs every isolation claim); (4) removed dead `FEED_PAGE_SIZE` constant + stray macOS EPERM temp file. **357 tests pass** (was 344); lint 0 errors; Slice 5 code fully type-clean
- **Slice 6 (Friends System) — ✅ MERGED to master (PR #3, 2026-06-05):** Full social graph on the symmetric `Friendship` row (userAId = requester, userBId = recipient — convention enforced only in `sendFriendRequest`/`blockUser`; accept/reject/remove/pending authorization all key off this direction). Endpoints: `POST /api/friends/{request,accept,reject,remove,block}`, `GET /api/friends` (+ `friendshipId` per friend), `GET /api/friends/pending` (incoming/outgoing split), `GET /api/users/search?q=`. Module `server/modules/friends/{controller,service,repo,schema,types}.ts`; notifications write-path bootstrapped (`notifications.{repo,service}.ts`, idempotent upsert by `idempotencyKey`) — read path is Slice 7. Web: `/friends` page + `FriendsList`/`FriendCard`/`FriendRequests`/`UserSearch` + `useFriends`/`useUserSearch`. Events: `FRIEND_REQUEST_SENT`, `FRIEND_REQUEST_ACCEPTED`, `FRIEND_REMOVED`, `USER_BLOCKED` (best-effort `void persistEvent().catch` — see limitation). Search input hardened (max50 → trim → NFKC → strip `%_\` → min2); friend rate limiters (request 5/min burst + 20/hr; actions 10/min; search 15/min). **Block (no migration):** reuses the existing `BLOCKED` enum + `searchUsers` filter (previously dead code); `blockFriendship` runs in a txn (deleteMany pair → create BLOCKED, userA=blocker); blocked users are fully hidden (search both directions, feed + friends list are ACCEPTED-only reads) and re-requests 409. **H1 race guard:** check-then-act in `sendFriendRequest` now catches Prisma P2002 → 409 via `isUniqueConstraintError` (`server/core/errors/prismaErrors.ts`). **Branch hygiene:** built off `master` + cherry-pick of the `tzChangedAt`/Turbopack build fix (master lacked it); dispatch tooling stays on `dispatch/smoke-test-dispatch`. Validation: type-check + Turbopack build + **498 unit tests** all green. **Hardened after 3 review rounds (F1–F6, 2026-06-04):** F1 `/remove` rejects BLOCKED rows + blocker-only `POST /api/friends/unblock` (so remove can never silently unblock, and blocks are reversible); F2 directional block delete (`blockFriendship` never erases the counter-party's block; `findDirectedFriendship` for exact pair lookup); F3 idempotent block on P2002; F4 P2025 (row-vanished-mid-write) mapped to domain errors on accept/reject/remove/cancel; F5 dedicated `POST /api/friends/cancel` (requester+PENDING-only, can't unfriend an accepted friend); F6 API_CONTRACTS synced. Added `USER_UNBLOCKED` event. **Limitations / DEFERRED (not blocking PR, see goals.md):** (a) reciprocal A→B/B→A under true concurrency can still create 2 rows — needs a `pairKey` unique + dedupe/backfill migration (HIGH migration risk); (b) events are best-effort, not transactional with the mutation (contradicts Principle #1 — accepted for MVP, flagged); (c) in-memory rate limiter is per-serverless-instance on Vercel — needs Redis/Upstash pre-launch (+ F7: friend-action limiter buckets per endpoint, not aggregate); (d) block/unblock **UI** buttons not built (endpoints exist); (e) no friends integration/E2E tests yet (unit-only; no jsdom/testing-library harness exists for component tests).
- **Slice 8A (Profiles + Post-Visibility Security) — ✅ MERGED to master (PR #4, 2026-06-05):** Stacked on Slice 6. **Security fix (commit `31141f34`):** `GET /api/posts/[id]` previously returned any post to any authed user — now friends-only via `posts.service.assertCanViewPost(viewerId, authorId)` (author OR `friends.service.areFriends`, else 404 — no existence leak); `getPost(viewerId, postId)` enforces it. **Profiles:** `friends.service.getRelationship` returns `{ state, friendshipId }` (self/friends/incoming/outgoing/blocked/none); `users.service.getPublicProfile` (identity + counts + relationship; blocked→404) and `getUserPostsByUsername` (friends-only grid, keyset cursor on `createdAt,id`). Endpoints `GET /api/users/[username]` + `/posts` (requireAuth + generalRateLimit; static `/me` & `/search` take precedence over the `[username]` segment — reserve those usernames). **Hybrid visibility:** identity discoverable to any authed user, workout grid friends-only (honors "no public feed"). Web: `/u/[username]` page + `/p/[postId]` read-only post view + `ProfileRelationshipControl` (Add / Requested✕ / Accept+Decline / ✓Friends→Remove, optimistic via `useProfileRelationship`); feed/friend/search rows link username+avatar → `/u/[username]`; `useProfile`/`useProfilePosts`/`usePost` hooks; `profile.api`/`posts.api`. **Consistency:** single cache-invalidation contract — every friendship mutation invalidates `['friends']`+`['feed']`+`['profile']` (`useFriends.syncSocialGraph` + `useProfileRelationship`). **No schema change.** Reuses all existing friends endpoints (no new relationship endpoints; reject = decline). Verified vs Next 16 docs (async `params`, `useParams`) per `app/web/AGENTS.md`. Validation: type-check + build + **552 unit tests** + lint 0. **DEFERRED (still outstanding):** profile-edit for self; block/unblock UI; profile integration/E2E.
- **Slice 7 (Notifications) — ✅ SHIPPED to production (2026-06-07):** Read path (GET /api/notifications + POST /api/notifications/read), bell badge, notification center. Direct-call pattern (service → notifications.service.createNotification, no event-bus) for reliability on serverless. Idempotency via `idempotencyKey @unique` upsert. 5 notification types: WELCOME (`user:{id}:WELCOME`), WORKOUT_VERIFIED (`post:{postId}:WORKOUT_VERIFIED`), FRIEND_POSTED (`post:{postId}:FRIEND_POSTED:{friendId}`), STREAK_BROKEN (`streak:{userId}:STREAK_BROKEN:{localDate}`), STREAK_AT_RISK (`streak:{userId}:STREAK_AT_RISK:{localDate}`). STREAK_AT_RISK fired by external hourly cron (cron-job.org → `/api/cron/streak-evaluator`, auth: `Bearer CRON_SECRET`) — Vercel Hobby plan limits built-in crons to once/day. **Critical audit fixes (2026-06-07, commit `cf4b5b6`):** all notification writes changed from detached `void` to `await ...catch()` so they complete inside the `after()`/cron boundary before serverless teardown; IDOR read-path tests added (mutation-verified: removing userId fails 6 tests); wiring tests added for all 5 types (mutation-verified). **626 tests pass.** Production smoke: STREAK_BROKEN notification correctly absent for pre-Slice-7 streak breaks (expected — no retroactive creation); cron auth verified (HTTP 200); app health clean. Deferred: click-through navigation on notification items; batch fan-out via createMany; per-user rate limit on GET /api/notifications; delete dead notificationDispatcher.ts scaffolding.
- **Slice 8D (Share — profile link) — ✅ MERGED to master (2026-06-07, commit `b66f01a`):** `ShareProfileButton` component on `/u/[username]` profile header. Web Share API on mobile (with title `@username on BeActive`); clipboard copy + 1.5s "Copied!" flash on desktop. Copies `https://<origin>/u/<username>`. Note: post-level share (↗ in PostEngagementBar) was already shipped as part of Slice 8B. This closes the profile-level gap. 2 files, frontend-only, no backend/DB changes.
- **Slice 8B (Post Engagement: Likes + Comments) — ✅ MERGED to master (PR #6 + PR #7, 2026-06-05):** Split into two stacked PRs. PR #6 (`feat/post-engagement`): `PostLike`/`PostComment` schema + migration `20260605120000_add_post_engagement`; `server/modules/interactions/{controller,service,repo,schema,types}.ts`; `POST /api/posts/[id]/like`, `DELETE /api/posts/[id]/like`, `POST /api/posts/[id]/comments`, `GET /api/posts/[id]/comments`; `FeedPostResponse` extended with `likeCount/commentCount/likedByMe`; `PostEngagementBar` shared component; `useLikeToggle`/`useComments`/`useAddComment` hooks; `interactions.api.ts`. PR #7 (`feat/profile-avatars`): Instagram-style profile grid (`/u/[username]`) + post viewer (`/u/[username]/p/[postId]`); avatar upload/crop/zoom/rotate via `AvatarEditor` + `react-easy-crop@5.5.7`; `ProfileAvatar`/`AvatarViewer` components; `useUpdateAvatar` hook; `R2` prefix `avatars/`; `User.avatarUrl` (no migration); `<Avatar>` shared UI component; nav avatar → self-profile link; `EditProfile` inline name/bio; `ProfilePostCard` + `CommentsSection` with avatars. **Avatar upload fix (PR #8, 2026-06-05):** React Strict Mode revoked the component-managed blob URL before `getCroppedBlob` could use it — fixed by changing `getCroppedBlob(imageSrc: string)` → `getCroppedBlob(imageSource: File | Blob)`, matching `stripExif`'s self-contained URL pattern. Validation: type-check + build + **588 unit tests** + lint 0. Smoke: `node --env-file=app/web/.env.local qa-interactions.mjs` (22 checks). **DEFERRED:** share UI (8C); block/unblock UI; profile integration/E2E.

### Architecture Website
- `index.html` in `/pitch/` directory → deploy to GitHub Pages for investor walkthroughs
- `beactive-architecture.jsx` → React artifact, renders in Claude UI

### Git Workflow
- Feature branches → PR → merge to `main`
- Push to `main` auto-deploys to Vercel production
- Protected `main` branch — no direct push (even solo founder uses PRs)
- Commit frequently: after each endpoint works, after each component works

### Document Sync
If you change any of these, check the others for consistency:
- Schema change in `data_model.md` → check `architecture.md`, `goals.md`, `API_CONTRACTS.md`
- New event → update `EVENT_CATALOG.md`, `architecture.md` §7, `RULE_REGISTRY.md`
- New state → update `STATE_MACHINE_REGISTRY.md`, `architecture.md` §8
- New rule → update `RULE_REGISTRY.md`, `architecture.md` §9
- New endpoint → update `API_CONTRACTS.md`, `goals.md` (relevant slice)

---

## 19. CORE PRINCIPLES (The 10 Commandments)

1. **Events are truth** — if it's not in the event log, it didn't happen
2. **State machines are law** — no state change without a valid transition
3. **Rules are centralized** — all business logic in the rule registry
4. **AI is read-only** — classification only, zero mutation authority
5. **Simplicity until proven otherwise** — no infra without proven need
6. **Vertical slices** — build end-to-end, never horizontal layers
7. **Deterministic behavior** — same events → same state, every time
8. **Modules are isolated** — cross-module via services, never repos
9. **Beginner readable** — any engineer understands any module in 10 minutes
10. **Production mindset from day one** — auth, validation, security are not optional