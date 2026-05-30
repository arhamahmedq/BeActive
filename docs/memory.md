# MEMORY.md — BeActive Engineering Memory v2.0

> **Purpose:** Persistent engineering decisions, resolved debates, and constraints. Prevents repeated mistakes. Read this before making any architectural change.

---

## PROJECT IDENTITY

- **Name:** BeActive
- **Type:** AI-native social fitness platform (BeReal + Strava + Instagram Stories + TikTok Streaks)
- **Platform:** Web-first (Next.js), mobile later (React Native)
- **Architecture:** Modular monolith + event-driven core + state machine enforcement
- **Stage:** MVP build (Phase 1)

---

## LOCKED DECISIONS (Do not revisit without strong justification)

### Stack
| Layer | Choice | Locked? |
|-------|--------|---------|
| Frontend | Next.js 14+ (App Router), TypeScript, TailwindCSS | YES |
| Backend | Next.js API Routes (MVP), Express extraction path | YES |
| Database | PostgreSQL via Supabase (managed) | YES |
| ORM | Prisma | YES |
| Auth | Supabase Auth (HTTP-only cookies, rotating refresh tokens) | YES |
| Storage | Cloudflare R2 (signed URLs, no egress fees) | YES |
| Hosting | Vercel (frontend + API), Supabase (DB + Auth) | YES |
| Validation | Zod (all inputs, all endpoints) | YES |
| Testing | Vitest (unit), Playwright (e2e) | YES |

### Architecture
| Decision | Status |
|----------|--------|
| Modular monolith (no microservices) | LOCKED until >500k DAU |
| Event-driven core (in-memory bus MVP) | LOCKED |
| State machines for user/workout/streak | LOCKED |
| Rule engine for business logic | LOCKED |
| AI is read-only classifier | LOCKED (non-negotiable) |
| Feed is computed not stored (MVP) | LOCKED until >10k DAU |
| UTC for all streak calculations | LOCKED |

---

## RESOLVED DEBATES

### Auth: Supabase Auth vs Clerk vs NextAuth
- **Chosen:** Supabase Auth
- **Why:** Free tier generous, built-in email/password + OAuth, JWT management, pairs with Supabase Postgres, simpler than self-hosted
- **Rejected Clerk:** Cost scales poorly, vendor lock-in, less control
- **Rejected NextAuth:** Too much config, session management complexity
- **Rejected raw JWT:** Security burden, easy to get wrong

### DB: PostgreSQL vs Firebase Firestore
- **Chosen:** PostgreSQL
- **Why:** Relational social graph, complex feed queries, foreign key integrity, Prisma compatibility
- **Rejected Firestore:** Poor relational queries, no JOINs, pricing unpredictable at scale

### Storage: R2 vs Supabase Storage vs S3
- **Chosen:** Cloudflare R2
- **Why:** S3-compatible API, zero egress fees, CDN-ready, simple
- **Rejected S3:** Egress costs add up with image-heavy app
- **Rejected Supabase Storage:** Less CDN control, tied to Supabase ecosystem

### Feed: Stored vs Computed
- **Chosen:** Computed (MVP)
- **Why:** Simpler, no cache invalidation complexity, sufficient for <10k users
- **Future:** Materialized feed table when query performance degrades

### Streak Window: Calendar day vs Rolling 24h
- **Chosen:** Rolling 24h from last verified workout
- **Why:** Timezone-agnostic, deterministic, no edge cases around midnight
- **User experience:** More forgiving (post at 11pm, next post at 10pm next day = valid)

---

## CONSTRAINTS

### Technical
- Vercel serverless function timeout: 10s (free), 60s (pro) — AI classification must be async
- Supabase free tier: 500MB database, 1GB storage, 50k auth users
- R2 free tier: 10GB storage, 10M reads/month, 1M writes/month
- Must work on mobile browsers (responsive, camera API support)

### Product
- One post per user per UTC day (prevents spam, preserves streak integrity)
- AI confidence threshold: 0.70 (below = rejected, above = verified)
- Streak window: 24 hours rolling from lastVerifiedAt
- At-risk warning: 20 hours after lastVerifiedAt
- Friends-only feed (no public/discover feed in MVP)
- Minimum age: 16+

### AI Safety
- AI is CLASSIFIER ONLY — never mutates DB, never triggers streaks, never ranks feed
- AI output is data input to rule engine — rules make decisions, not AI
- AI failures default to PENDING (not rejected) — human-reviewable
- AI model version tracked per classification for debugging

---

## KNOWN FUTURE TECHNICAL DEBT

| Area | Current State | When to Address |
|------|--------------|-----------------|
| Feed ranking | Simple recency + streak boost | When users complain about feed quality |
| Notification delivery | In-app only | When mobile app ships (web push first) |
| AI processing | Synchronous-ish (async worker but no queue) | When upload volume > 100/min |
| Friend graph queries | Direct SQL JOINs | When friend lists > 500 per user average |
| Media processing | Basic EXIF strip, no resize | When storage costs matter |
| Event log | Single table, no partitioning | When table > 10M rows |
| Caching | None | When feed query p95 > 500ms |

---

## ANTI-PATTERNS (Things we must never do)

1. **Never put business logic in controllers** — controllers are routing only
2. **Never put business logic in frontend** — frontend consumes APIs, displays data
3. **Never let AI write to DB directly** — AI output feeds into rule engine
4. **Never skip event emission** — every state change must emit an event
5. **Never use localStorage for auth tokens** — HTTP-only cookies only
6. **Never hardcode secrets** — .env only, never committed
7. **Never create a table without architect approval** — schema is sacred
8. **Never bypass Zod validation** — all inputs validated, no exceptions
9. **Never use offset pagination** — cursor-based only (feed, notifications)
10. **Never trust client-provided file metadata** — validate server-side

---

## NAMING CONVENTIONS

| Context | Convention | Example |
|---------|-----------|---------|
| Files | camelCase | `auth.service.ts` |
| Database tables | PascalCase (Prisma) | `User`, `Post`, `Streak` |
| Database columns | camelCase | `userId`, `createdAt` |
| API routes | kebab-case | `/api/auth/signup` |
| Event types | SCREAMING_SNAKE | `WORKOUT_VERIFIED` |
| Enums | SCREAMING_SNAKE | `PENDING`, `VERIFIED` |
| Environment vars | SCREAMING_SNAKE | `DATABASE_URL` |
| React components | PascalCase | `FeedCard.tsx` |
| Hooks | camelCase with use | `useAuth.ts` |
| CSS classes | Tailwind utilities | `flex items-center` |

---

## DOCUMENT SYNC REGISTRY

These documents must stay synchronized. A change in one may require changes in others:

| Document | Depends On | Depended By |
|----------|-----------|-------------|
| architecture.md | context.md | All others |
| data_model.md | architecture.md | goals.md, security.md |
| goals.md | architecture.md, data_model.md | agent_runbook.md |
| security.md | architecture.md | agent_runbook.md, memory.md |
| agent_runbook.md | architecture.md, goals.md | None |
| context.md | None | architecture.md |
| memory.md | All | All (reference) |

**Rule:** If you change the schema in data_model.md, check architecture.md event catalog and goals.md slice definitions for consistency.

---

## CORE PRINCIPLE

Speed with discipline. Every shortcut compounds. Every decision documented. Every mistake prevented from recurring.
