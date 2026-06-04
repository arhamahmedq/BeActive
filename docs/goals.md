# GOALS.md — BeActive Execution Roadmap v2.0

> **Purpose:** Defines every vertical slice, execution order, completion criteria. No ambiguity.

---

## EXECUTION MODEL

Every slice follows: **Architect → Backend → Frontend → QA → Deploy**

A slice is COMPLETE only when: deployed to production, all tests pass, QA approves.

---

## SLICE 0 — PROJECT SCAFFOLD (Foundation)

**Objective:** Working monorepo with database, auth provider, storage, and deploy pipeline.

**Deliverables:**
- Monorepo structure (`/apps/web`, `/server`, `/shared`, `/prisma`)
- Prisma schema with all tables migrated
- Supabase project connected (Auth + Postgres)
- Cloudflare R2 bucket created
- Vercel project linked to GitHub repo
- Environment variables configured (dev + production)
- Core middleware: auth guard, rate limiter, error handler, logger
- Event bus initialized (in-memory EventEmitter)

**Definition of Done:** `npm run dev` serves frontend, API routes respond, DB connected, deploy works.

---

## SLICE 1 — AUTHENTICATION (Identity Layer)

**Objective:** Secure session-based auth. Every subsequent slice depends on this.

**Backend:**
- POST /api/auth/signup → create user in Supabase Auth + users table
- POST /api/auth/login → verify credentials, set session cookie
- POST /api/auth/logout → invalidate session
- GET /api/auth/session → return current user or 401
- Auth middleware on all protected routes
- Rate limiting: 5 attempts/min on login

**Frontend:**
- Signup page (email, username, password)
- Login page
- Onboarding flow (display name, avatar upload, timezone)
- Protected route wrapper (redirect to login if no session)
- Session hydration on page load

**Database:** users table, default streak row created on signup

**Events emitted:** USER_SIGNED_UP, USER_LOGGED_IN

**Definition of Done:** Can sign up, log in, log out, refresh page and stay logged in. Protected routes redirect. Rate limiting works.

---

## SLICE 2 — UPLOAD & WORKOUT PROOF (Core Action)

**Objective:** User captures photo → uploads → post created → AI queued.

**Backend:**
- POST /api/uploads/sign → returns pre-signed R2 upload URL
- POST /api/posts/create → validates upload, creates post (PENDING), emits WORKOUT_UPLOADED
- GET /api/posts/:id → returns post with workout data
- EXIF stripping on server after upload confirmation
- File validation: MIME check, size limit (10MB), extension check
- One VERIFIED post per user per UTC day enforcement

**Frontend:**
- Camera capture (mobile: native camera API, desktop: file picker)
- Image preview before upload
- Upload progress indicator
- Success/error states
- Retry on failure

**Storage:** Cloudflare R2 with signed URLs, randomized filenames (CUID)

**Events emitted:** WORKOUT_UPLOADED

**Definition of Done:** Can take photo, upload to R2, see post created in DB with PENDING status. Works on mobile and desktop.

---

## SLICE 3 — AI CLASSIFICATION (Verification Layer)

**Objective:** Process uploaded images, classify as workout or not, emit verification events.

**Backend:**
- AI worker processes WORKOUT_UPLOADED events
- Sends image to AI Vision API (Claude Vision or OpenAI Vision)
- Receives classification: { isWorkout, type, confidence }
- If confidence >= 0.70: creates Workout record, emits WORKOUT_VERIFIED
- If confidence < 0.70: emits WORKOUT_REJECTED
- Updates post status (VERIFIED or REJECTED)
- Failure handling: retry 3x with backoff, then mark for manual review

**AI Boundary Enforcement:**
- AI worker has read-only image access
- AI output is DATA — fed into rule engine, not directly into DB state
- AI cannot trigger streaks or modify user state

**Events emitted:** WORKOUT_VERIFIED, WORKOUT_REJECTED

**Definition of Done:** Uploaded images get classified within 30 seconds. Confidence threshold correctly gates verification. Failures retry gracefully.

---

## SLICE 4 — STREAK ENGINE (Retention Core)

**Objective:** Deterministic streak tracking. The single most important system for retention.

**Backend:**
- Streak state machine: INACTIVE → ACTIVE → BROKEN → ACTIVE (cycle)
- On WORKOUT_VERIFIED: evaluate and update streak (increment or restart)
- Cron job (hourly): check all ACTIVE streaks for at-risk/broken status
- At 20h since last workout: user → AT_RISK, emit STREAK_AT_RISK
- At 24h since last workout: streak → BROKEN, emit STREAK_BROKEN
- GET /api/streaks/me → current streak, best, status, lastVerifiedAt
- GET /api/streaks/:userId → public streak info

**Frontend:**
- Streak counter on profile and feed
- Streak status indicator (flame icon: green/yellow/red)
- "Streak at risk" warning banner

**Events emitted:** STREAK_UPDATED, STREAK_AT_RISK, STREAK_BROKEN, STREAK_RECOVERED

**Edge cases:**
- Two posts same day → second ignored
- AI takes 2 hours → streak uses post.createdAt, not verification time
- Server downtime → cron catches up using timestamps, not wall clock

**Definition of Done:** Streak increments correctly on verified workout. Breaks correctly after 24h. At-risk warning fires at 20h. No false breaks. No duplicate increments.

---

## SLICE 5 — SOCIAL FEED (Distribution Layer)

**Objective:** Friends-only ranked feed showing verified workout posts.

**Backend:**
- GET /api/feed?cursor=X&limit=20
- Pipeline: fetch friend IDs → fetch VERIFIED posts from friends → rank → paginate
- Ranking: recency_score * (1 + streak_boost)
- Cursor-based pagination (no offset)
- Post response includes: user info, workout type, streak count, timestamp

**Frontend:**
- Infinite scroll feed
- Post cards: photo, user avatar, username, streak count, workout type, caption, timestamp
- Loading skeletons
- Empty state ("Add friends to see their workouts!")
- Pull-to-refresh

**Events consumed:** WORKOUT_VERIFIED (triggers feed eligibility)

**Definition of Done:** Feed shows only verified posts from accepted friends. Pagination works. No data leaks (can't see non-friends' posts). Ranking is deterministic.

---

## SLICE 6 — FRIENDS SYSTEM (Social Graph)

**Status:** ✅ REVIEW-READY (2026-06-04) — implemented on `feature/slice-6-friends`, pending PR. All DoD criteria met. Deferred items (unblock, durable rate limiting, reciprocal-duplicate pairKey, integration/E2E) tracked below.

**Objective:** Send/accept/remove friend requests. Foundation for feed, notifications, DMs.

**Backend:**
- POST /api/friends/request → send friend request
- POST /api/friends/accept → accept pending request
- POST /api/friends/reject → reject pending request
- POST /api/friends/remove → remove friendship
- POST /api/friends/block → block user
- GET /api/friends → list accepted friends
- GET /api/friends/pending → list pending requests
- GET /api/users/search?q=username → find users to add

**Frontend:**
- Friends list page
- Pending requests section
- User search
- Add/accept/reject/remove buttons

**Events emitted:** FRIEND_REQUEST_SENT, FRIEND_REQUEST_ACCEPTED, FRIEND_REMOVED, USER_BLOCKED

**Definition of Done:** Can send request, accept, see friends list. Blocked users fully hidden. No self-friendship. No duplicate requests.

**DoD status (2026-06-04):**
- ✅ Send / accept / reject / remove / list / pending / search — all implemented + unit-tested.
- ✅ Block — `POST /api/friends/block` writes a BLOCKED row (no migration; reuses existing enum). Blocked users are fully hidden: excluded from search (both directions), absent from the pull-model feed + friends list (ACCEPTED-only reads), and new requests are rejected (409).
- ✅ No self-friendship — guarded in `sendFriendRequest` and `blockUser`.
- ✅ No duplicate requests — `findFriendshipBetween` pre-check + P2002 race guard (409). **Limitation:** reciprocal A→B / B→A under true concurrency can still create two rows (the unique index is directional); structural fix = `pairKey` migration, deferred (see below).

**Deferred (post-review / pre-production, NOT blocking Slice 6 PR):**
- Unblock endpoint + a "Block" button in the web UI (DoD only requires block + "fully hidden").
- `pairKey` unique + dedupe/backfill migration to eliminate the reciprocal-duplicate race (HIGH migration risk — isolate).
- Durable rate limiter (the in-memory Map is per-serverless-instance on Vercel).
- Friends integration tests (real Postgres) + E2E happy path.

---

## SLICE 7 — NOTIFICATIONS (Behavioral Reinforcement)

**Objective:** Event-driven notifications that drive daily return behavior.

**Backend:**
- Notification dispatcher listens to events (STREAK_AT_RISK, FRIEND_REQUEST_SENT, WORKOUT_VERIFIED, etc.)
- Creates notification records with idempotency key
- GET /api/notifications → paginated notification list with unread count
- POST /api/notifications/read → mark notifications as read
- Future: push notification integration (web push API)

**Frontend:**
- Notification bell icon with unread count badge
- Notification center (dropdown or page)
- Click notification → navigate to relevant content

**Idempotency:** No duplicate notification per (userId + type + date)

**Events consumed:** All events that should notify a user

**Definition of Done:** Notifications appear for all relevant events. No duplicates. Unread count accurate. Read status persists.

---

## SLICE 8 — STORIES (Ephemeral Layer) — Post-MVP

**Objective:** Verified workouts auto-publish as 24h ephemeral stories.

**Implementation:**
- Stories = posts WHERE status = VERIFIED AND createdAt > NOW() - 24h
- No separate table needed
- Horizontal story bar at top of feed
- Click to view full-screen story with reactions
- Cron cleans up expired story visibility (or just filter in query)

---

## SLICE 9 — DM / SNAP SYSTEM — Post-MVP

**Objective:** Friends-only messaging for accountability pairs.

**Implementation:**
- REST API for send/receive (MVP)
- WebSocket for real-time (later)
- Text + image messages
- Conversation thread per friend pair

---

## EXECUTION ORDER SUMMARY

| Order | Slice | Dependency | Critical? |
|-------|-------|-----------|-----------|
| 0 | Project Scaffold | None | YES |
| 1 | Authentication | Slice 0 | YES |
| 2 | Upload & Post | Slice 1 | YES |
| 3 | AI Classification | Slice 2 | YES |
| 4 | Streak Engine | Slice 3 | YES |
| 5 | Social Feed | Slice 4 + 6 | YES |
| 6 | Friends System | Slice 1 | YES |
| 7 | Notifications | Slice 4 + 6 | YES |
| 8 | Stories | Slice 5 | NO (post-MVP) |
| 9 | DM System | Slice 6 | NO (post-MVP) |

**Note:** Slices 5 and 6 can be built in parallel. Feed needs friends, but friends can be built independently.

---

## CORE PRINCIPLE

Every slice is a **production-grade behavioral system**, not a feature checkbox. Each slice must independently function in production before the next begins.
