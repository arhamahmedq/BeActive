# CLAUDE.md — BeActive Project Bible

> **Last updated:** 2026-06-09 — compact pass. 636 tests passing. All MVP slices 0–8E shipped.
> **✅ PRE-LAUNCH CHECKLIST — ALL DONE:** R2 CORS ✅ · Upstash Redis ✅ · Sentry ✅
> **Rule:** `architecture.md` wins all contradictions. This file is the index; `/docs/` are the source of truth.

---

## 1. PROJECT OVERVIEW

**BeActive** — "Strava meets BeReal." Daily workout proof, social accountability, streak-powered retention.
**Platform:** Web-first (Next.js). Mobile later (React Native).
**Stage:** Pre-seed / MVP. Solo founder + AI-assisted engineering.
**Architecture:** Modular monolith + event-driven core + state machine enforcement.

**IS:** Daily social habit engine · behavioral accountability platform · AI classifies, never decides.
**NOT:** Fitness tracker · social media feed · Strava clone.

---

## 2. TECH STACK (LOCKED)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ App Router, TypeScript strict, TailwindCSS, Zustand, TanStack Query |
| Backend | Next.js API Routes (serverless on Vercel), Zod (all endpoints), node-cron/BullMQ |
| Data | PostgreSQL via Supabase, Prisma ORM, Cloudflare R2 (images) |
| Auth | Supabase Auth, HTTP-only cookies (SameSite=Lax), rotating refresh tokens |
| Infra | Vercel (hosting + auto-deploy), Supabase (DB + auth), Sentry (errors, 10% trace sample) |
| Testing | Vitest (unit + integration), Playwright (E2E) |

---

## 3. DEVELOPMENT COMMANDS

```bash
npm run dev                     # Next.js dev server (localhost:3000)
npm run build / lint / type-check

npx prisma generate             # After schema changes
npx prisma migrate dev          # Dev migrations
npx prisma migrate deploy       # Staging/prod
npx prisma studio               # Visual DB browser

npm run test / test:integration / test:e2e / test:watch
npm run audit:timezones         # Phase 0 DoD: "Invalid" count = 0
npm run backfill:completions    # Idempotent — run once after Phase 2 deploy
npm run validate:parity         # Phase 3 DoD: exits 0 with 0 diverged rows

git push origin main            # Auto-deploys to Vercel production
```

---

## 4. PROJECT STRUCTURE

```
/BeActive
├── app/web/                    # Next.js frontend (App Router)
│   ├── app/(auth)/             # /login, /signup
│   ├── app/(main)/             # /feed, /profile, /upload, /friends, /u/[username]
│   ├── app/api/                # Thin route controllers (auth, feed, friends, notifications, posts, streaks, uploads, users, stories, cron)
│   ├── components/{ui,features,layouts}/
│   └── hooks/, lib/, styles/
├── server/
│   ├── core/{events,rules,state-machines,middleware,errors,logger}/
│   └── modules/{auth,users,posts,workouts,streaks,feed,friends,notifications,stories,ai}/
├── shared/{types,constants,utils}/
├── prisma/{schema.prisma,migrations}/
├── tests/{unit,integration,e2e}/
├── docs/                       # architecture.md (master) + all spec docs
├── scripts/                    # QA + maintenance scripts (backfill, parity, audit)
└── .env.example, tsconfig.json, tailwind.config.ts, next.config.js, vitest.config.ts
```

Each server module: `module.{controller,service,repo,schema,types}.ts`

---

## 5. CODE CONVENTIONS

| Context | Convention | Example |
|---------|-----------|---------|
| Module files | `module.role.ts` | `auth.service.ts`, `posts.repo.ts` |
| DB tables | PascalCase (Prisma) | `User`, `Post`, `Streak` |
| DB columns | camelCase | `userId`, `createdAt` |
| API routes | kebab-case | `/api/auth/signup` |
| Events / Enums | SCREAMING_SNAKE_CASE | `WORKOUT_VERIFIED`, `PENDING` |
| Env vars | SCREAMING_SNAKE_CASE | `DATABASE_URL` |
| React components | PascalCase | `FeedCard.tsx` |
| React hooks | `use` prefix | `useAuth.ts` |
| TS types | PascalCase | `CreatePostRequest` |
| Zod schemas | camelCase + Schema | `signupSchema` |

**Import order:** node built-ins → external packages → `@/shared` → `@/server/core` → `./same-module`

**TypeScript:** `strict: true`. No `any` (use `unknown` + type guards). Explicit return types on services/repos. Infer types from Zod schemas.

**State:** TanStack Query for server state · Zustand for UI state only · no Redux · no React Context for data.

---

## 6. WHAT TO AVOID (CRITICAL)

**Architecture:** No business logic in controllers/repos/frontend. No cross-module repo imports — go through services. Controllers: parse → call service → return only.

**Events:** Every state change MUST emit an event. Register in EVENT_CATALOG.md first. Events table is append-only — never update/delete rows.

**State Machines:** Never mutate streak/workout state directly — always through state machine. No transitions not in STATE_MACHINE_REGISTRY.md.

**AI Boundary (NON-NEGOTIABLE):** AI cannot write to DB, trigger transitions, access user/streak/friend data, or decide streak increments. Classifier only: image in → `{ isWorkout, type, confidence }` out.

**Auth/Security:** HTTP-only cookies only (never localStorage). Zod on every endpoint server-side. No hardcoded secrets. No internal IDs/stack traces in API responses. Auth middleware on all mutation endpoints.

**DB:** Cursor-based pagination only (no offset). No raw SQL without data_model.md check. No `prisma migrate` in prod without review. Validate file metadata server-side (don't trust client MIME/extension).

---

## 7. CORE LOGIC

### The 5 System Primitives
1. **Event System** — immutable, append-only, replayable
2. **State Machines** — valid transitions only
3. **Rule Engine** — centralized IF/THEN (R1-R9)
4. **AI Layer** — classifier, read-only
5. **Execution Services** — thin wrappers, no decisions

### Request Flow
```
Client → API (auth + validate + rate limit) → Controller → Service → Event Emitter
    → Rule Engine → State Machine → Database → Async Workers
```

### Streak Engine v2 (CURRENT — calendar-day)
- **Ledger:** `DailyCompletion` table — one row per user per local calendar date (IANA timezone from `User.timezone`)
- **Idempotency:** P2002 on `(userId, localDate)` unique — replaces UTC same-day guard
- **Recompute:** `recomputeStreak(ledger, tz, now)` pure function — called on every WORKOUT_VERIFIED
- **AT_RISK:** fires past `EVENING_HOUR` with no completion today
- **BROKEN:** confirmed via recompute to guard races
- **API shape:** `{ current, best, status, lastVerifiedDate, completedToday, displayTier }`
- **Cron:** external hourly via cron-job.org → `/api/cron/streak-evaluator` (Vercel Hobby = once/day limit)
- v1 rolling-24h code fully removed (migration `20260601200000_drop_v1_streak_fields`)

### AI Classification
- Provider: `AI_PROVIDER=gemini` (gemini-2.5-flash-lite) or `claude`
- Output: `{ isWorkout, type, confidence, processingTimeMs, modelVersion }`
- Threshold: ≥0.70 → VERIFIED · <0.70 → REJECTED · 0.50–0.69 → PENDING
- Failure: retry 3× with exponential backoff → PENDING + manual review flag

### Feed Ranking
```
score = recency_score * (1 + streak_boost)
recency_score = 1 / (1 + hours_since_post / 24)
streak_boost = MIN(streak_days / 100, 0.5)
```
`FEED_WINDOW_DAYS=30`, `FEED_CANDIDATE_CAP=500`. Pull model (no materialized table). `emptyReason` only on `cursor === null`.

### Business Rules (R1-R9)
| Rule | Trigger | Action |
|------|---------|--------|
| R1 | AI ≥ 0.70 | Post → VERIFIED, emit WORKOUT_VERIFIED |
| R2 | AI < 0.70 | Post → REJECTED, emit WORKOUT_REJECTED |
| R3 | WORKOUT_VERIFIED | Increment/restart streak, emit STREAK_UPDATED |
| R4 | WORKOUT_VERIFIED | Create feed post + publish story |
| R5 | Cron: AT_RISK condition | Send urgent notification |
| R6 | Cron: BROKEN condition | Streak → BROKEN, notify user |
| R7 | WORKOUT_VERIFIED | Notify each friend |
| R8 | FRIEND_REQUEST_ACCEPTED | Notify both users, enable feed visibility |
| R9 | USER_SIGNED_UP | Create default streak (INACTIVE), send welcome |

### State Machines
- **Workout:** `PENDING → VERIFIED (≥0.70) or REJECTED (<0.70)`
- **Streak:** `INACTIVE → ACTIVE → BROKEN → ACTIVE (count=1)`

---

## 8. ENVIRONMENT VARIABLES

```bash
DATABASE_URL                    # Supabase Postgres
SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY   # SERVICE_KEY: SERVER-ONLY
R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL / R2_ENDPOINT
AI_PROVIDER="gemini"            # or "claude"
GEMINI_API_KEY                  # free at aistudio.google.com/apikey
CRON_SECRET                     # Bearer token for /api/cron/* endpoints
NEXT_PUBLIC_APP_URL             # App URL
NEXT_PUBLIC_SENTRY_DSN          # Production only
NEXT_PUBLIC_STREAK_DEBUG="true" # Dev only — never in production
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
```

Never commit `.env`. `SUPABASE_SERVICE_KEY` and `AI_API_KEY` are never `NEXT_PUBLIC_`.

---

## 9. API ENDPOINTS (Quick Reference)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/signup` | Create account (3/min) |
| POST | `/api/auth/login` | Login (5/min) |
| POST/GET | `/api/auth/logout` / `/api/auth/session` | Session management |
| POST | `/api/uploads/sign` | Pre-signed R2 URL (10/hr) |
| POST | `/api/posts/create` | Create post (5/hr) |
| GET | `/api/posts/:id` | Single post (friends-only, 404 not 403) |
| GET | `/api/feed?cursor&limit=20` | Ranked friends feed |
| GET | `/api/streaks/me` · `/api/streaks/:userId` | Streak data |
| POST | `/api/friends/{request,accept,reject,remove,cancel,block,unblock}` | Friend actions |
| GET | `/api/friends` · `/api/friends/pending` | Friend lists |
| GET | `/api/users/search?q=` · `/api/users/me` · `PATCH /api/users/me` | Users |
| GET | `/api/users/[username]` · `/api/users/[username]/posts` | Profiles |
| GET/POST | `/api/notifications?cursor` · `/api/notifications/read` | Notifications |
| GET | `/api/stories/generate?postId=X` | 1080×1920 story card PNG (owner + VERIFIED only) |

Full shapes → `/docs/API_CONTRACTS.md`

---

## 10. DATABASE SCHEMA (Quick Reference)

| Table | Key Fields |
|-------|-----------|
| `User` | id, email, username, timezone (IANA), role [USER\|ADMIN], avatarUrl |
| `Post` | id, userId, imageUrl, imageKey, caption, status [PENDING\|VERIFIED\|REJECTED] |
| `Workout` | id, postId (unique), type, aiConfidence, modelVersion |
| `Streak` | id, userId (unique), current, best, status [INACTIVE\|ACTIVE\|BROKEN], lastVerifiedDate |
| `DailyCompletion` | id, userId, localDate — unique(userId, localDate) |
| `Friendship` | id, userAId (requester), userBId, status [PENDING\|ACCEPTED\|BLOCKED] — unique(userAId,userBId) |
| `Notification` | id, userId, type, title, body, data (JSON), read, idempotencyKey (unique) |
| `PostLike` | postId, userId — unique |
| `PostComment` | id, postId, userId, content |
| `Event` | id, type, userId, payload (JSON), source — **APPEND-ONLY** |

Events table: NEVER update/delete. One streak per user. One workout per post. No self-friendships.

Full schema → `/docs/data_model.md`

---

## 11. EXECUTION ROADMAP

| # | Slice | Status |
|---|-------|--------|
| 0–3 | Scaffold, Auth, Upload, AI | ✅ COMPLETE |
| 4 | Streak Engine v2 (calendar-day) | ✅ COMPLETE — all phases shipped |
| 5 | Social Feed | ✅ COMPLETE |
| 6 | Friends System | ✅ MERGED (PR #3, 2026-06-05) |
| 8A | Profiles + Post-Visibility | ✅ MERGED (PR #4, 2026-06-05) |
| 8B | Engagement (Likes + Comments + Avatars) | ✅ MERGED (PR #6+7, 2026-06-05) |
| 7 | Notifications | ✅ SHIPPED production (2026-06-07) |
| 8D | Share (profile link) | ✅ MERGED (2026-06-07) |
| 8E | Story Sharing Phase 1 | ✅ SHIPPED (2026-06-08) — 636 tests |
| 8C | Comments v2 | NOT STARTED |
| 8 | Stories (full) | NOT STARTED (post-MVP) |
| 9 | DM System | NOT STARTED (post-MVP) |

---

## 12. FEATURE SPEC TEMPLATE

```
FEATURE / MODULE / SLICE
ENDPOINTS: METHOD /path → {req} → {res}
DB CHANGES / EVENTS EMITTED / STATE TRANSITIONS / RULES TRIGGERED
AI INVOLVEMENT / VALIDATION RULES / EDGE CASES / FAILURE MODES
DEFINITION OF DONE
```

---

## 13. MODULE COMMUNICATION

```
ALLOWED:  controller→own service · service→own repo · service→other service
          service→core/events · service→core/rules · service→core/state-machines

FORBIDDEN: controller→repo · service→other repo · frontend→repo/service
           repo→repo · repo→event bus · controller→business logic
```

---

## 14. ERROR HANDLING

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

| Code | HTTP | When |
|------|------|------|
| VALIDATION_ERROR | 400 | Zod failed |
| UNAUTHORIZED | 401 | No session |
| FORBIDDEN | 403 | Wrong permissions |
| NOT_FOUND | 404 | Resource missing |
| CONFLICT | 409 | Duplicate |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Never expose details |

Error classes: `AppError` → `ValidationError`, `NotFoundError`, etc. — see `server/core/errors/AppError.ts`

---

## 15. DEBUGGING PROTOCOL

Check in order: API contract → Zod validation → auth middleware → service logic → rule engine → state machine → Prisma query → DB state (Prisma Studio) → frontend state (Zustand/TanStack Query). No guessing.

---

## 16. HOW CLAUDE SHOULD USE THIS FILE

**Every session:** Read this file → read `docs/architecture.md` → read task-specific docs.

**Before code:** Confirm slice scope (`goals.md`) → fill feature spec template → check `data_model.md` + `STATE_MACHINE_REGISTRY.md` + `EVENT_CATALOG.md` + `API_CONTRACTS.md`.

**Conflicts:** `architecture.md` > `data_model.md` > `API_CONTRACTS.md` > `memory.md` > this file.

---

## 17. FILE UPDATE INSTRUCTIONS

Update CLAUDE.md when: tech stack changes · slice status changes · new commands/scripts added · new env vars · new anti-patterns discovered · important gotchas found.

---

## 18. NOTES / GOTCHAS

### Streak Pet (deferred — TODO)
- Visual plant in `StreakWidget.tsx` that grows with `streak.current`. Frontend-only.
- Tiers: 0=seed · 1–49=sprout · 50–99=sapling · 100–199=tree · 200–999=elder · 1000+=legendary
- Animate `animate-pet-bounce` on COMPLETED_TODAY · `animate-breathe` on AT_RISK · static otherwise.

### Known Constraints
- **React Strict Mode (Next.js dev):** Never pass `URL.createObjectURL` into async functions — URL may be revoked. Pattern: create + revoke inside the function. See `getCroppedBlob` (takes `File | Blob`, not string), `stripExif`.
- Vercel serverless timeout: 10s (free) / 60s (pro) — AI classification MUST be async.
- One VERIFIED post per user per local calendar date (enforced via DailyCompletion P2002).
- In-memory rate limiter is per-serverless-instance — needs Redis/Upstash pre-launch (Upstash configured ✅).

### QA Commands
```bash
node --env-file=app/web/.env.local qa-streak.mjs      # Streak T1–T7 (dev server required)
node --env-file=app/web/.env.local qa-friends.mjs     # Friends 25-check smoke
node --env-file=app/web/.env.local qa-interactions.mjs # Engagement 22-check smoke
npm run audit:timezones                                # TZ readiness (no dev server needed)
npm run backfill:completions && npm run validate:parity # Streak v2 parity gate
```

### Key Implementation Decisions (per slice)

| Slice | Critical Gotchas |
|-------|-----------------|
| Upload (2) | EXIF stripped client-side via canvas; R2 upload uses XHR for progress |
| AI (3) | HF CLIP dropped; `AI_PROVIDER=gemini` (gemini-2.5-flash-lite); ≥0.70=VERIFIED |
| Streaks v2 | `DailyCompletion` ledger + `recomputeStreak()` pure fn; tz from `User.timezone` (IANA); v1 `lastVerifiedAt`/`activityState` fully removed |
| Feed (5) | Pull model (no materialized table); frozen T0 cursor; `emptyReason` gated on `cursor===null` only |
| Friends (6) | `userAId`=requester convention; `blockFriendship` txn (deleteMany pair → create BLOCKED); P2002→409 race guard; `/cancel` for PENDING-only; `/remove` rejects BLOCKED rows |
| Profiles (8A) | `assertCanViewPost` returns 404 not 403 (no existence leak); identity discoverable to all authed users, workout grid friends-only |
| Notifications (7) | Direct-call (no event bus); `idempotencyKey` upsert; all writes `await`'d (not void) for serverless boundary; hourly cron via cron-job.org |
| Engagement (8B) | `getCroppedBlob(source: File\|Blob)` — not string — Strict Mode revokes blob URLs before async use |
| Stories (8E) | Card system in `app/web/lib/story-card/` (`constants`=IG safe areas 250/340/72px + `STORY_SAFE_BAND`; `StoryFrame` wrapper that auto-applies safe areas; `StoryCard` template; `font`=bundled static TTFs). **Satori/@vercel/og can't render woff2 OR variable fonts → ship static TTF instances; `ImageResponse` renders lazily during stream so buffer via `.arrayBuffer()` inside try/catch to catch errors (else worker crashes = empty reply); image data-URI mime must match real bytes.** `StoryShareButton` → Web Share API `files[]` w/ `<a download>` fallback. Dev-only preview: `/api/stories/preview?debug=safe`. See [[story-card-render]] memory. |

### Git Workflow
Feature branch → PR → merge to `main` → auto-deploys to Vercel production. No direct push to `main`.

### Document Sync
- Schema change → check `architecture.md`, `goals.md`, `API_CONTRACTS.md`
- New event → update `EVENT_CATALOG.md`, `architecture.md §7`, `RULE_REGISTRY.md`
- New rule → update `RULE_REGISTRY.md`, `architecture.md §9`
- New endpoint → update `API_CONTRACTS.md`, `goals.md`

---

## 19. CORE PRINCIPLES

1. **Events are truth** — if not in event log, it didn't happen
2. **State machines are law** — no change without valid transition
3. **Rules are centralized** — all business logic in rule registry
4. **AI is read-only** — classification only, zero mutation authority
5. **Simplicity until proven otherwise** — no infra without proven need
6. **Vertical slices** — end-to-end, never horizontal layers
7. **Deterministic behavior** — same events → same state
8. **Modules are isolated** — cross-module via services, never repos
9. **Beginner readable** — any engineer understands any module in 10 minutes
10. **Production mindset from day one** — auth, validation, security are not optional
