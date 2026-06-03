# SLICE 5 — SOCIAL FEED — Implementation Contract

> **Status:** REVISED PER ARCHITECTURE REVIEW — design locked, ready for implementation
> **Author:** Lead Staff Engineer (system design review)
> **Date:** 2026-06-03
> **Revision:** R1 (2026-06-03) — incorporated all approved architecture-review findings: T0/window consistency (§8, §10), honest pagination guarantee (§8, §13), candidate-cap invariant (§8, §10, §12), empty-state split A/B (§4, §9), feed cache invalidation (§4, Phase F), controller boundary tests (§12, Phase E), cursor hardening (§8, §9), and the forward-compatibility/deferred register (new §14).
> **Audience:** Any engineer implementing Slice 5. This document is the contract — implement from this, not from memory of a conversation.
> **Authority order:** `architecture.md` > `data_model.md` (schema) > `API_CONTRACTS.md` (wire shapes) > this document. This doc refines, it does not override those.

---

## Section 1 — Recovered Project Context

### Architecture (verified from source, not assumed)

BeActive is a **modular monolith** (CLAUDE.md §13). Each domain lives in `server/modules/<name>/` with a fixed file layout: `*.controller.ts` (thin route handler), `*.service.ts` (business logic, event emission), `*.repo.ts` (Prisma only, no logic), `*.schema.ts` (Zod), `*.types.ts` (module-internal types). Cross-module communication is **service → other service only** — a service must never import another module's repo, and a controller must never touch a repo directly.

Verified integration points:

| Concern | Verified fact | File |
|---|---|---|
| Auth | `requireAuth(request) → AuthContext \| NextResponse`. Returns `{ userId }` or a 401 `NextResponse`. | `server/core/middleware/auth.ts` |
| Query validation | `validateQuery<T>(searchParams, schema) → T \| NextResponse` **already exists** — reuse it. | `server/core/middleware/validate.ts:30` |
| Controller pattern | `requireAuth` → guard `instanceof NextResponse` → `try { service() } catch (isAppError ? toErrorResponse : InternalError)`. | `server/modules/streaks/streaks.controller.ts` |
| Route pattern | Route files are 1-liners that delegate to a controller handler. | `app/web/app/api/streaks/me/route.ts` |
| Repo seam | Repos thread an optional `db: Prisma.TransactionClient \| typeof prisma = prisma` for atomicity. Feed is read-only so it does not need a transaction, but should keep the same default-`prisma` signature style. | `server/modules/streaks/streaks.repo.ts` |
| Errors | `AppError` subclasses (`ValidationError` 400, `UnauthorizedError` 401, `NotFoundError` 404, `InternalError` 500), `isAppError`, `toErrorResponse`. | `server/core/errors/AppError.ts` |
| Shared day definition | `toLocalDateStr(instant, tz)` — single source of "what local day is it". Not needed by the feed read path (feed orders by absolute `createdAt`), but referenced for context. | `shared/utils/timezone.ts` |
| Frontend data | TanStack Query. Existing hooks: `useAuth`, `useStreak`, `usePostStatus`. Feed will add `useFeed` (`useInfiniteQuery`). | `app/web/hooks/` |

### Relevant schema (verified, `prisma/schema.prisma`)

- **`Post`**: `id @cuid`, `userId`, `imageUrl`, `imageKey`, `caption? @db.VarChar(500)`, `status PostStatus @default(PENDING)`, `createdAt`, `updatedAt`. Indexes: `@@index([userId, createdAt(sort: Desc)])`, `@@index([status, createdAt(sort: Desc)])`. Relations: `user` (many:1), `workout Workout?` (1:1 optional).
- **`Workout`**: `postId @unique`, `type WorkoutType`, `aiConfidence`, `modelVersion`.
- **`User`**: `id`, `username @unique`, `avatarUrl?`, `streak Streak?` (1:1 optional), `friendshipsA`/`friendshipsB`.
- **`Streak`**: `userId @unique`, `current @default(0)`, `best`, `status StreakStatus`, `lastVerifiedDate String?`.
- **`Friendship`**: symmetric **single row** — `userAId`, `userBId`, `status FriendshipStatus`. `@@unique([userAId, userBId])`, `@@index([userAId, status])`, `@@index([userBId, status])`. A friendship between X and Y is ONE row, not two; the membership query must check both arms.
- Enums: `PostStatus { PENDING, VERIFIED, REJECTED }`, `FriendshipStatus { PENDING, ACCEPTED, BLOCKED }`, `WorkoutType { GYM, RUNNING, CYCLING, SWIMMING, OUTDOOR, SPORTS, OTHER }`.

### Relevant API (locked, `API_CONTRACTS.md`)

`GET /api/feed?cursor=string&limit=number(default 20, max 50)` → `{ posts: [{ id, imageUrl, caption, createdAt, user: { id, username, avatarUrl, streak: { current } }, workout: { type } }], nextCursor: string | null }`.

### Current state of the feed & friends modules (verified — all pure stubs)

`feed.service.ts`, `feed.repo.ts`, `feed.controller.ts`, `feed.types.ts` = `export type {}`. `feed.schema.ts` = `export const placeholder = z.object({})`. `friends.service.ts`, `friends.repo.ts` = `export type {}` (labelled Slice 6). `app/web/app/(main)/feed/page.tsx` shows a "Feed coming in Slice 5." placeholder. **There is no feed/friends code to integrate with — this slice writes it from zero.**

### Uncertainties (explicit)

1. **Friendship canonical ordering** — whether `(userAId, userBId)` is stored sorted is undefined until Slice 6 writes the mutation path. **Mitigation:** the read query checks *both* arms, so it is correct regardless of the convention Slice 6 later adopts. No assumption made.
2. **`API_CONTRACTS.md` staleness** — its `/streaks/me` example still shows the v1 `lastVerifiedAt` shape (superseded by the implemented v2 shape). This does not affect the feed contract, which is current. Flag only.
3. **Pull-to-refresh** is listed in `goals.md`. Treated as a frontend nicety (a manual refetch), not a backend requirement — see §3.

---

## Section 2 — Product Goals

**Purpose.** The feed is BeActive's *distribution layer*: it turns a private logging action (verify a workout) into a *social signal* a user's friends see. It is the payoff that makes daily logging feel observed and worthwhile.

**User value.** A user opens the app and sees a recency-ranked stream of their own and their friends' verified workouts — proof that the people they're accountable to are showing up too.

**Habit-formation goal.** Visibility creates social accountability. Seeing a friend's fresh post is a peer cue to log your own; seeing your own post land reinforces the loop. The `streak_boost` term deliberately surfaces high-streak friends higher, modelling the behaviour we want to spread.

**Relationship to streak retention.** Streaks drive *individual* retention; the feed drives *network* retention. A friend's visible streak is a retention pressure on the viewer. The feed therefore reads (never writes) streak state and uses `Streak.current` as a ranking input — it amplifies the streak engine without coupling to it.

---

## Section 3 — Scope Definition

### In Scope

- `GET /api/feed` — auth-required, cursor-paginated, ranked.
- Feed author set = **viewer's own** verified posts **∪ accepted friends'** verified posts (approved decision).
- **VERIFIED posts only.** PENDING and REJECTED never appear.
- Deterministic ranking: `recency_score × (1 + streak_boost)` with a stable tie-break.
- Cursor (keyset) pagination with a **frozen snapshot clock (T0)** — stable under a fixed author set and fixed streak inputs (see §8 for the honest guarantee and its accepted MVP caveats).
- Friend-graph **read** layer: `getAcceptedFriendIds(userId)` (repo + service + tests) — this much of the friends module is built now.
- Frontend: infinite-scroll feed, `FeedCard`, loading skeletons, **two empty states (Case A / Case B, §4)**, error state.

### Out of Scope (strict — do not let these creep in)

- **Any friendship mutation** — send / accept / reject / remove (Slice 6).
- **Schema changes / migrations / new tables.** No `FeedItem` table, no materialized feed. (The composite index in §10 is a *recommendation for a future slice*, gated on architect approval — NOT part of this slice's deliverables.)
- **New infrastructure** — no Redis, no queue, no search index, no recommendation service, no realtime/websockets.
- **Event handler / feed materialization.** "Feed eligibility" (`goals.md`) is satisfied implicitly because the verify pipeline already sets `Post.status = VERIFIED`; the feed is a pull/read model and consumes no events at runtime. (Documented simplicity decision — see §13 self-review.)
- **True pull-to-refresh gesture.** Ship a manual refetch (invalidate `['feed']`); a native gesture is a later polish item.
- **Comments, likes, reactions, profiles, post detail view.**
- **Friend affinity in ranking** — locked at `1.0` per CLAUDE.md §7.

---

## Section 4 — User Experience

| State | Behaviour |
|---|---|
| **Empty — Case A: no connections** | First page returns `{ posts: [], nextCursor: null, emptyReason: 'NO_CONNECTIONS' }` (service sets this when `friendIds.length === 0`). UI: *"Add friends to see their workouts!"* with a primary Find-Friends affordance. The Find-Friends destination is a **Slice 6 dependency**; in Slice 5 the CTA renders the copy and is inert / links to a "coming soon" — it must not block the empty state. |
| **Empty — Case B: connected but quiet** | First page returns `{ posts: [], nextCursor: null, emptyReason: 'NO_RECENT_ACTIVITY' }` (service sets this when `friendIds.length > 0` but no in-window verified posts exist). UI: *"No recent workouts yet — when you or your friends post, they'll show up here."* No add-friends CTA. We do **not** widen the window to chase older posts (§10). |
| **Has own posts, no friends** | Sees their own verified posts, ranked normally. No special-casing. |
| **Has friends** | Sees own ∪ friends' verified posts interleaved by rank. |
| **Self-post visibility** | Own verified posts appear inline, ranked by the same formula using the viewer's *own* `Streak.current` — not pinned to top. |
| **Self-post freshness (cache)** | When the viewer's own post transitions `PENDING → VERIFIED`, the feed cache must be invalidated so the new post can appear on the next snapshot — see the cache-invalidation note below and Phase F. |
| **Friend-post visibility** | Only ACCEPTED friends. PENDING/BLOCKED relationships contribute nothing. |
| **Infinite scroll** | `useInfiniteQuery`; an `IntersectionObserver` sentinel at list end triggers `fetchNextPage()` while `hasNextPage`. |
| **Loading (initial)** | 3 skeleton `FeedCard`s (reuse the existing skeleton style from `feed/page.tsx`). |
| **Loading (next page)** | A single spinner/skeleton at the list foot. |
| **Error** | Inline retry card: *"Couldn't load your feed. Retry."* wired to `refetch()`. Never surface raw error text. |
| **End of feed** | When `nextCursor === null` (and `posts` is non-empty), stop observing and (optionally) show an end-of-list marker. |

**Empty-state discriminator (Case A vs Case B).** The two empty cases are distinguished **server-side** via `emptyReason`, because only the service knows the viewer's accepted-friend count (`friendIds.length`) — the client cannot infer it without a friends endpoint (Slice 6). `emptyReason` is set **only** on an empty first page (`posts.length === 0 && nextCursor === null`): `'NO_CONNECTIONS'` when `friendIds.length === 0`, else `'NO_RECENT_ACTIVITY'`. It is `undefined`/absent on every non-empty response. This is a minimal, backward-compatible, mobile-safe extension of the locked `{ posts, nextCursor }` shape — full type in §9. **Doc-sync required (no code now):** add `emptyReason` to `API_CONTRACTS.md`'s `GET /api/feed` entry when this revision is ratified.

**Feed cache invalidation (`PENDING → VERIFIED`).** The viewer's own verified posts belong in the feed, but the verify transition is asynchronous and the feed query is cached under `['feed']` with snapshot pagination — a freshly verified own post would otherwise not surface until an unrelated refetch. On the client, when an own post is observed to reach `VERIFIED` (the existing `usePostStatus` poll already detects this transition), the feed cache must be invalidated: `queryClient.invalidateQueries({ queryKey: ['feed'] })`. That re-snapshots the feed (new T0) so the fresh own post appears. Documented here and in Phase F — **no implementation in this design phase.**

**FeedCard null-safety & formatting (acceptance criteria for Phase F).** `FeedCard` must render defensively: `avatarUrl === null` → initial/placeholder avatar; `caption === null` → omit the caption line entirely; `createdAt` (an ISO string on the wire) → rendered as relative time ("2h ago") via a shared formatter. These are explicit Phase F acceptance criteria, not optional polish.

---

## Section 5 — System Design

```
Client (useFeed / useInfiniteQuery)
  │  GET /api/feed?cursor&limit
  ▼
Route  app/web/app/api/feed/route.ts            (1-line delegate)
  ▼
Controller  feed.controller.handleGetFeed       (auth + validate + error mapping)
  ▼
Service  feed.service.getFeed                    (orchestration, frozen clock T0)
  ├─► friends.service.getAcceptedFriendIds(userId)   ── cross-module via SERVICE
  │        └─► friends.repo.getAcceptedFriendIds      (two-arm Prisma query)
  ├─ authorIds = unique([userId, ...friendIds])       (own ∪ friends)
  ├─► feed.repo.getFeedCandidates(authorIds, window)  (single findMany, nested select)
  ├─ rankPosts(candidates, T0)                         (pure — feed.ranking.ts)
  └─ sliceByCursor(ranked, cursor, limit, T0)          (pure — feed.cursor.ts)
  ▼
{ posts, nextCursor }  →  UI renders FeedCard[]
```

**Stage responsibilities**

1. **Route** — delegates to the controller. No logic.
2. **Controller** — `requireAuth`; `validateQuery` against `feedQuerySchema`; call `getFeed`; map `AppError → toErrorResponse`, anything else → `InternalError` 500.
3. **Service** — freezes `const now = _now ?? new Date()` (T0); resolves `authorIds`; fetches candidates; ranks; slices by cursor; builds `nextCursor`. Holds *all* feed business logic.
4. **Friend graph (service→service)** — `getAcceptedFriendIds` is the only friends surface this slice exposes.
5. **Repo** — one Prisma `findMany`. No ranking, no cursor math, no logic.
6. **Pure cores** — `rankPosts` and cursor encode/decode/slice are pure functions (mirroring the `recomputeStreak` philosophy): trivially unit-testable, no I/O.

---

## Section 6 — Friend Graph Read Layer

### `getAcceptedFriendIds(userId): Promise<string[]>`

**Repository responsibility** (`friends.repo.ts`). Return the set of user IDs that are ACCEPTED friends of `userId`, resolved across both arms of the symmetric row:

```ts
// friends.repo.ts
import { FriendshipStatus } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })
  // Map each row to "the other side"; dedupe defensively.
  const ids = new Set<string>()
  for (const r of rows) ids.add(r.userAId === userId ? r.userBId : r.userAId)
  ids.delete(userId) // belt-and-suspenders: never include self
  return [...ids]
}
```

> **Index note.** The `OR` over two single-column indexes (`[userAId, status]`, `[userBId, status]`) is bitmap-OR friendly in Postgres. If a query plan ever shows a seq scan at scale, split into two `findMany`s (one per arm) and concat — each then uses one index cleanly. Acceptable to ship the `OR` form for MVP.

**Service responsibility** (`friends.service.ts`). Thin pass-through — no logic to add yet, but the seam must exist so `feed.service` calls a *service*, never the repo:

```ts
// friends.service.ts
import * as friendsRepo from './friends.repo'
export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  return friendsRepo.getAcceptedFriendIds(userId)
}
```

**Query strategy.** Single round trip, status-filtered, both arms. Returns `string[]` (order irrelevant — the feed re-ranks).

**Edge cases.**
- No friendships → `[]`.
- Only PENDING/BLOCKED → `[]` (status filter).
- Self never appears (no self-friendship is allowed; defensively deleted anyway).
- Duplicates impossible (`@@unique`), deduped anyway.

**Test coverage** (`tests/unit/friends.service.test.ts`, mock `friends.repo`; plus repo-shape assertions):
- returns the *other* id when `userId` is on arm A, and when on arm B;
- excludes PENDING and BLOCKED rows;
- excludes unrelated users' friendships;
- `[]` when none;
- never returns `userId` itself.

**Slice 6 forward-compatibility (confirmed — no coupling that blocks future mutations).** This slice adds only a *read* (`getAcceptedFriendIds`); it introduces no friendship state, no canonical-ordering assumption, and no write path. Therefore:
- Slice 6 may freely add `request / accept / reject / remove` mutations and may choose any `(userAId, userBId)` insertion convention — the two-arm read stays correct either way.
- The `getAcceptedFriendIds(userId): Promise<string[]>` signature is the **stable public contract** Slice 6 must preserve (the feed and, later, the R7 `FRIEND_POSTED` notification dispatcher both depend on it). Slice 6 extends the module; it does not rename or re-shape this function.
- Directional `BLOCKED` semantics (X blocks Y but not the reverse) are a Slice 6 *modelling* concern (the symmetric single-row + single-`status` schema cannot express asymmetric blocks cleanly). The feed's `ACCEPTED`-only filter is safe regardless, and this is flagged for the Slice 6 design — see §14.

---

## Section 7 — Ranking Design

Locked formula (CLAUDE.md §7), implemented as a **pure function** `rankPosts(posts, now)`:

```
hoursSince   = max(0, (now - createdAt) / 3_600_000)     // clamp ≥ 0 (future-skew safe)
recencyScore = 1 / (1 + hoursSince / 24)                 // ∈ (0, 1], strictly ↓ with age
streakBoost  = min((authorStreakCurrent ?? 0) / 100, 0.5) // ∈ [0, 0.5]
score        = recencyScore * (1 + streakBoost)
```

**Ordering:** `score DESC`, tie-broken by `id ASC`. The id tie-break gives a **total order** (cuid ids are unique) — the basis for stable cursor pagination (§8), under the input-stability caveats stated there.

```ts
// feed.ranking.ts  (pure, no imports beyond types + constants)
export interface RankabledPost { id: string; createdAt: Date; authorStreakCurrent: number /* + carry-through fields */ }

export function scorePost(p: { createdAt: Date; authorStreakCurrent: number }, now: Date): number {
  const hoursSince = Math.max(0, (now.getTime() - p.createdAt.getTime()) / 3_600_000)
  const recency = 1 / (1 + hoursSince / 24)
  const boost = Math.min((p.authorStreakCurrent ?? 0) / 100, 0.5)
  return recency * (1 + boost)
}

export function rankPosts<T extends { id: string; createdAt: Date; authorStreakCurrent: number }>(
  posts: T[], now: Date,
): Array<T & { score: number }> {
  return posts
    .map((p) => ({ ...p, score: scorePost(p, now) }))
    .sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
```

**Determinism.** For a fixed `now` (T0), `score` is a pure function of `createdAt` and `authorStreakCurrent`; with the `id` tie-break the order is total and reproducible. This is the property pagination relies on (§8).

**Author with no `Streak` row** → `authorStreakCurrent = 0` → `boost = 0`. (`Streak` is optional 1:1; map `null` to `0` in the repo→service projection.)

**Why app-layer, not SQL.** The blended `recency × (1+boost)` cannot be expressed in Prisma's typed query API and would require `$queryRaw` — untyped, harder to test, and couples ranking to Postgres. Candidate sets at MVP are small (§10), so ranking in TypeScript as a pure, unit-tested function is simpler and strictly more testable. Documented scaling boundary in §10.

Ranking constants live in `shared/constants/index.ts`: `FEED_RECENCY_HALFLIFE_HOURS = 24`, `FEED_STREAK_BOOST_DIVISOR = 100`, `FEED_STREAK_BOOST_CAP = 0.5`.

---

## Section 8 — Pagination Design

**Why cursor, not offset.** Mandated by CLAUDE.md (no offset pagination). Offset pagination duplicates/skips rows when the underlying set shifts, and degrades (`OFFSET n` scans n rows). Keyset/cursor over the total order `(score, id)` is O(page).

**The snapshot model — T0 governs everything time-dependent.** `recency_score` decays continuously, so a naïve cursor would reshuffle between page fetches. To stabilise a pagination session we freeze a single clock value **T0**:

- **Page 1** mints `T0 = Date.now()` and embeds it in the cursor.
- **Every subsequent page** reuses `cursor.t` as T0 — **no live clock participates after page 1.**
- **T0 governs BOTH scoring AND the candidate-window calculation.** Scores are computed with `scorePost(post, T0)` *and* the retrieval window is `windowStart = new Date(T0 − FEED_WINDOW_DAYS)`. Deriving `windowStart` from a fresh `Date.now()` on a later page would shift the window forward between pages, letting a near-boundary post enter one page's candidate set but not another's → a gap or duplicate. The window MUST come from frozen T0, never from a live clock. (This is the §10 contract — `feed.service` computes `windowStart` from T0 and passes it to `feed.repo`.)

**Cursor shape** (opaque to clients):

```ts
// decoded payload
interface FeedCursor { t: number; s: number; id: string }  // T0 epoch ms, lastScore, lastId
// wire form: base64url(JSON.stringify(payload))   — base64URL, NOT base64 (query-string safe)
```

**Cursor handling (`feed.cursor.ts`) — required behaviour:**
- **base64url** for both encode and decode (`Buffer.from(raw, 'base64url')`). Never plain `base64` — its `+ / =` corrupt query strings.
- **Empty cursor = first page.** An absent cursor *or* an empty string (`""`) is treated as "no cursor" → mint a fresh `T0`. This is **not** a validation error.
- **Malformed cursor** (non-decodable, bad JSON, wrong shape, wrong types) → throw `ValidationError` → 400.
- **Sane `t` bounds.** Reject a decoded `t` outside `[now − 7d, now + 1h]` as malformed (guards a stale/forged T0 that would collapse `recency_score` to a constant). `s` and `id` are used only for the boundary comparison and cannot widen authorization (§11).

**Slice semantics.** Given the ranked array (computed with T0):
- **First page:** take the first `limit` items.
- **Subsequent page:** keep items strictly *after* the cursor in the total order — `score < s OR (score === s AND id > cursor.id)` — then take `limit`.
- **`nextCursor`:** if `limit` items were returned *and* unreturned items remain in the ranked array, set `nextCursor = encode({ t: T0, s: lastScore, id: lastId })`; otherwise `null`.

**Ordering guarantee (honest scope — not an absolute claim).** Within a single pagination session, ordering is **stable under a fixed author set and fixed streak inputs**: with T0, `windowStart`, the author set, and each author's `Streak.current` all held constant, the `(score, id)` total order is fixed, so pages do not duplicate or skip items. This is the property the cursor relies on.

This is an **MVP-acceptable** guarantee, deliberately not mathematically absolute. Two inputs are read live on each page and can therefore shift ordering *between* requests:
- **Streak changes** — an author who verifies a workout mid-session increments `Streak.current`; their posts' `streak_boost` (and thus scores) change, so the cursor's stored `s` may no longer match the recomputed boundary score — at worst shifting a single item by one position (one duplicate or one skip).
- **Friend-graph changes** — once Slice 6 ships mutations, an accept/remove mid-session changes the author set, which can inject or drop a ranked item on a later page.

Both are rare within the few seconds of an active scroll, behaviourally benign (you *should* stop seeing a removed friend), and of the same class as "a post deleted mid-session simply disappears." We accept them for MVP rather than freezing every ranking input — full input-freezing would require a materialised snapshot, which is out of scope (§10, §14). Posts *created after* T0 do not enter the current snapshot; they appear on a fresh feed load (new T0), which is exactly what the §4 cache-invalidation hook triggers.

**Candidate-cap interaction.** Pagination can only traverse what retrieval returned. The candidate query is capped at `FEED_CANDIDATE_CAP` (§10); a snapshot therefore surfaces **at most `FEED_CANDIDATE_CAP` posts**. If a snapshot's in-window verified posts exceed the cap, the oldest beyond the cap are not reachable in that snapshot and `nextCursor` becomes `null` at the cap boundary (no error, no partial signal — the user sees a normal end-of-feed). See §10 for the invariant + scaling trigger and §12 for the required `candidates === cap` test.

---

## Section 9 — API Contract

### `GET /api/feed`

```
Auth:    Required (401 UNAUTHORIZED if no session)
Query:   ?cursor=<opaque string, optional>&limit=<int 1..50, default 20>
```

**Success 200**

```jsonc
{
  "posts": [
    {
      "id": "ckp...",
      "imageUrl": "https://cdn.../x.jpg",
      "caption": "Leg day" ,            // string | null
      "createdAt": "2026-06-03T08:00:00.000Z",
      "user": {
        "id": "usr_...",
        "username": "arham",
        "avatarUrl": "https://.../a.png", // string | null
        "streak": { "current": 12 }
      },
      "workout": { "type": "GYM" }        // object | null (defensive; verified posts should always have one)
    }
  ],
  "nextCursor": "eyJ0Ijo..."             // string | null
  // emptyReason is OMITTED on any non-empty response (see empty-page example)
}
```

**Empty first page (Case A / Case B — see §4):**

```jsonc
{ "posts": [], "nextCursor": null, "emptyReason": "NO_CONNECTIONS" }      // friendIds.length === 0
{ "posts": [], "nextCursor": null, "emptyReason": "NO_RECENT_ACTIVITY" }  // friendIds.length > 0, nothing in window
```

**TypeScript wire types** — live in `shared/types/feed.ts`, re-exported from `shared/types/index.ts` (CLAUDE.md §5: "All API request/response types in `/shared/types/`"). The frontend hook imports these.

```ts
// shared/types/feed.ts
export interface FeedPostResponse {
  id: string
  imageUrl: string
  caption: string | null
  createdAt: string                 // ISO 8601 (Date serialized)
  user: {
    id: string
    username: string
    avatarUrl: string | null
    streak: { current: number }     // 0 when the author has no streak row
  }
  workout: { type: string } | null
}
export type FeedEmptyReason = 'NO_CONNECTIONS' | 'NO_RECENT_ACTIVITY'
export interface FeedResponse {
  posts: FeedPostResponse[]
  nextCursor: string | null
  emptyReason?: FeedEmptyReason     // present ONLY on an empty first page (posts:[], nextCursor:null); absent otherwise
}
export interface FeedQuery { cursor?: string; limit: number }
```

> **`emptyReason` rationale (F4).** The discriminator is server-set because only the service knows `friendIds.length`; the client cannot infer it pre-Slice-6. It is a minimal, backward-compatible, mobile-safe extension of the locked `{ posts, nextCursor }` shape. **Doc-sync required (no code now):** add `emptyReason` to `API_CONTRACTS.md`'s `GET /api/feed` entry when this revision is ratified.

**Errors**

| Condition | Code | HTTP |
|---|---|---|
| No session | `UNAUTHORIZED` | 401 |
| `limit` out of range (`<1` or `>50`) | `VALIDATION_ERROR` | 400 |
| Malformed / out-of-bounds cursor (bad base64url, bad JSON, wrong shape, `t` outside `[now−7d, now+1h]`) | `VALIDATION_ERROR` | 400 |
| Unexpected | `INTERNAL_ERROR` | 500 (never leak details) |

> **Cursor edge:** an **absent or empty** `cursor` (`""`) is a valid *first-page* request (mint fresh `T0`), **not** a 400. Only a present-but-undecodable/out-of-bounds cursor is a validation error. (See §8 cursor handling.)

> **Note on the `createdAt` type:** the repo returns a JS `Date`; `NextResponse.json` serializes it to an ISO string, so the wire type is `string`. The internal `RankabledPost` keeps it as `Date` for scoring; the service maps to `FeedPostResponse` (Date→ISO happens automatically at JSON serialization, so no manual `.toISOString()` is required — but the shared type must declare `string`).

---

## Section 10 — Data Access Review

**Candidate query (single statement, no N+1):**

```ts
// feed.repo.ts
import { PostStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'

// `windowStart` and `cap` are CALLER-SUPPLIED. The service MUST derive
// `windowStart` from the frozen T0 (cursor.t), never from a live clock — see §8.
// `cap` is FEED_CANDIDATE_CAP from shared/constants. The repo adds no logic.
export async function getFeedCandidates(
  authorIds: string[],
  windowStart: Date,                              // = new Date(T0 − FEED_WINDOW_DAYS)
  cap: number,                                    // = FEED_CANDIDATE_CAP
): Promise<FeedCandidateRow[]> {
  if (authorIds.length === 0) return []          // viewer always in set, so this is rare
  return prisma.post.findMany({
    where: {
      userId: { in: authorIds },
      status: PostStatus.VERIFIED,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    take: cap,                                    // hard backstop on candidate volume
    select: {
      id: true, imageUrl: true, caption: true, createdAt: true,
      user: { select: { id: true, username: true, avatarUrl: true,
                        streak: { select: { current: true } } } },
      workout: { select: { type: true } },
    },
  })
}
```

- **N+1: none.** One query returns posts with nested `user`, `user.streak`, and `workout` via `select`. Prisma issues a bounded number of statements (not per-row). Friend IDs are one prior query. **Two queries per page** (+ the auth check), regardless of result size.
- **Required indexes:** uses existing `@@index([userId, createdAt(sort: Desc)])` per author. Sufficient at MVP volumes.
- **Query complexity:** `O(candidates)` fetch (capped) + `O(n log n)` in-memory sort. Candidate ceiling ≈ `min(cap, friends × postsPerAuthorInWindow)`. With a 30-day window and ~1 verified post/user/day, a user with 50 friends tops out near 50×30 ≈ 1,500 — comfortably in-memory; `cap` (e.g. 500) bounds pathological cases.
- **`windowStart` (must come from frozen T0):** `new Date(T0 − FEED_WINDOW_DAYS)` where `FEED_WINDOW_DAYS` (e.g. 30) is a `shared/constants` value. T0 is `cursor.t` on later pages and `Date.now()` only on page 1 (§8). Posts older than the window have negligible `recency_score`, so excluding them is both a perf bound and behaviourally neutral. **Never compute `windowStart` from a fresh clock per page** — that reintroduces the F1 gap/duplicate bug.
- **Candidate cap invariant (`FEED_CANDIDATE_CAP`, e.g. 500):** `take: cap` hard-bounds retrieval, so a snapshot surfaces **at most `cap`** posts. Behaviour when `candidates === cap`: the ranked array is exactly `cap` long, pagination traverses it normally, and `nextCursor` becomes `null` at its end — any in-window verified posts beyond the cap are **silently unreachable in that snapshot** (no error). This is acceptable at MVP volumes (the §“Query complexity” ceiling is well under `cap`); it is a *bounded truncation*, not a correctness bug, but it MUST be tested (§12 `candidates === cap` case) so the boundary behaviour is intentional and visible.
- **Future scaling (OUT OF SCOPE — architect approval required):**
  1. Add composite `@@index([userId, status, createdAt(sort: Desc)])` to `Post` — the ideal index for this exact `userId IN … AND status … ORDER BY createdAt` pattern. *Not added in this slice* (no schema changes).
  2. If candidate sets outgrow memory: push keyset+ranking into SQL (`$queryRaw`) or precompute a materialized feed. Deferred until metrics justify it (Engineering Principle #5).
  3. **Cap-frequency trigger:** *when candidate counts frequently hit `FEED_CANDIDATE_CAP`, re-evaluate the retrieval strategy* (the in-memory full-fetch-per-page model can no longer surface all eligible posts — that is the signal to move to keyset-in-SQL or a materialised feed, per trigger 2). Instrument the cap-hit rate before raising the cap blindly.

---

## Section 11 — Security & Isolation

**The single authorization chokepoint** is the author set, re-derived from the friend graph on **every** request:

```
authorIds = unique([ viewerId, ...getAcceptedFriendIds(viewerId) ])
where: { userId: { in: authorIds }, status: VERIFIED, createdAt: { gte: windowStart } }
```

Proofs:

1. **Users see only authorized content.** A post is returned only if its `userId ∈ authorIds`. `authorIds` contains the viewer plus *accepted* friends only. A non-friend's `userId` is never in the set ⇒ their posts are unreachable.
2. **Friendship boundaries enforced server-side.** `getAcceptedFriendIds` filters `status = ACCEPTED`. PENDING/BLOCKED contribute nothing. Membership is recomputed per request from the DB — never cached in or trusted from the client.
3. **The cursor cannot widen access.** The cursor carries only `{ t, s, id }` — a clock and a sort position. It never carries `authorIds`. A forged/tampered cursor can at most pick a different *slice* of the viewer's *own* authorized set; it can never introduce a new author. Authorization is independent of the cursor.
4. **Status leak prevention.** `status: VERIFIED` is applied unconditionally ⇒ the viewer's own PENDING/REJECTED posts (and everyone else's) are excluded.
5. **Field leak prevention.** The nested `select` returns only `{ id, username, avatarUrl, streak.current }` and `{ workout.type }` — no `email`, `timezone`, `imageKey`, `aiConfidence`, or internal fields cross the wire.
6. **No detail leakage on error.** Controller maps non-`AppError` to `InternalError` (generic 500) — no stack traces or SQL.

**Operational notes (deferred — out of scope for this slice, tracked in §14):**
- **Rate limiting.** `GET /api/feed` ships **without** a rate limiter in this slice. It is a read, but it does two queries + an in-memory sort and will be the hottest endpoint. A generous per-user read limiter (e.g. ~60/min) is a follow-up — and note the existing in-memory limiter is **ineffective on Vercel serverless** (per `rateLimit.ts`), so this is gated on the same Redis/Upstash work the rest of the app needs. Not solved here; explicitly deferred.
- **Mobile auth assumption.** The feed inherits the app-wide Supabase cookie session via `requireAuth` (HTTP-only cookie). A future React Native client cannot use browser cookies and will need bearer-token bridging — an app-wide concern the feed adopts, not a feed-specific decision. The opaque cursor and plain-JSON contract are otherwise mobile-clean.

---

## Section 12 — Testing Strategy

> Mirror the existing patterns: pure-function unit tests (like `recomputeStreak.test.ts`) and a mocked-persistence integration simulator (like `tests/integration/streak-simulation.test.ts`). No live DB required.

| Category | File(s) | Purpose | Acceptance | Fails if |
|---|---|---|---|---|
| **Friend read (unit)** | `tests/unit/friends.service.test.ts` | Verify `getAcceptedFriendIds` arm-mapping & filtering | Both arms mapped; PENDING/BLOCKED/non-friends excluded; `[]` when none; never returns self | Returns a non-friend, a self id, or a PENDING edge |
| **Ranking (unit)** | `tests/unit/feed/ranking.test.ts` | Verify `scorePost`/`rankPosts` | Recency strictly ↓ with age; boost capped at 0.5; `id ASC` tie-break; future-skew clamped to ≤1 recency; null streak → boost 0 | Order non-deterministic or formula drift |
| **Cursor (unit)** | `tests/unit/feed/cursor.test.ts` | Encode/decode/slice + hardening | Round-trip identity (base64url); **absent/empty `""` cursor → first page (no error)**; malformed/bad-shape → `ValidationError`; **`t` outside `[now−7d, now+1h]` → `ValidationError`**; slice boundary strictly excludes the cursor item; `nextCursor` null at end | Dupe/gap at a boundary; malformed cursor accepted; empty cursor 400s; out-of-bounds `t` accepted |
| **Service (unit)** | `tests/unit/feed/feed.service.test.ts` | `getFeed` orchestration (mock `friends.service` + `feed.repo`, inject `_now`) | authorIds = friends ∪ self; empty friends still includes self; **`windowStart` derived from frozen T0 (= `cursor.t` on page 2), not live now**; correct slice & `nextCursor`; maps `streak: null → current: 0`; **empty + `friendIds.length===0` → `emptyReason:'NO_CONNECTIONS'`; empty + friends>0 → `'NO_RECENT_ACTIVITY'`; `emptyReason` absent on non-empty** | Self omitted; window from live clock; wrong page math; null-streak crash; wrong/missing/extra `emptyReason` |
| **Controller (unit / HTTP boundary)** | `tests/unit/feed/feed.controller.test.ts` | Auth + validation + error mapping (mock `requireAuth`, `getFeed`) | **401** when `requireAuth` returns its `NextResponse`; **400** on `limit` out of range and on a malformed cursor (`ValidationError → toErrorResponse`); **200** with `{ posts, nextCursor }` on success; non-`AppError` → **500 `INTERNAL_ERROR`** with no detail leak | A missing/short-circuited auth guard, mis-mapped status code, or leaked error detail ships untested |
| **Isolation (integration)** | `tests/integration/feed-isolation.test.ts` | Prove no data leak | Non-friend's VERIFIED post never returned; PENDING/REJECTED never returned; a **forged cursor cannot widen the author set**; only whitelisted fields present | Any non-authorized post, cursor-driven escalation, or extra field appears |
| **Pagination (integration)** | `tests/integration/feed-pagination.test.ts` | Stitch pages over a fixed snapshot | page1 ⊕ page2 ⊕ … = full ranked set; no dupes; no gaps; terminates with `nextCursor=null`; **`candidates === FEED_CANDIDATE_CAP` → exactly `cap` posts traversed, then `nextCursor=null` (bounded truncation, no error)** | Any item duplicated/skipped; non-termination; cap boundary errors or silently mis-paginates |

**DoD test gate:** full suite green (current baseline ~238 passing) plus all new feed tests; the controller boundary, isolation, pagination, and `candidates === cap` cases all pass.

---

## Section 13 — Execution Plan

Build inner-to-outer (pure cores first, frontend last). Each phase is independently testable and leaves the tree green.

### Phase A — Friend read layer
- **Goal:** `getAcceptedFriendIds` end-to-end (repo + service).
- **Files:** `server/modules/friends/friends.repo.ts`, `friends.service.ts`; `tests/unit/friends.service.test.ts`.
- **Deliverables:** two-arm ACCEPTED query; thin service; tests.
- **Acceptance:** §6 tests pass.
- **Risks:** unknown canonical ordering → *mitigated* by querying both arms.

### Phase B — Pure ranking + cursor cores
- **Goal:** `scorePost`, `rankPosts`, `encodeCursor`, `decodeCursor`, `sliceByCursor` — zero I/O.
- **Files:** `server/modules/feed/feed.ranking.ts`, `feed.cursor.ts`; `shared/constants/index.ts` (ranking + window + cap + limit constants); `tests/unit/feed/ranking.test.ts`, `tests/unit/feed/cursor.test.ts`.
- **Deliverables:** pure functions + exhaustive unit tests.
- **Acceptance:** §7/§8 tests pass; deterministic order proven.
- **Risks:** float comparison in tie-break → resolved by `id` tie-break.

### Phase C — Repo + wire types
- **Goal:** `getFeedCandidates` and the shared contract types.
- **Files:** `server/modules/feed/feed.repo.ts`, `feed.types.ts`; `shared/types/feed.ts`; `shared/types/index.ts` (re-export `./feed.js`).
- **Deliverables:** single capped, windowed, status-filtered `findMany` with nested `select`; `FeedPostResponse`/`FeedResponse`/`FeedQuery`.
- **Acceptance:** type-check passes; query returns nested user/streak/workout in one call.
- **Risks:** N+1 / over-select → guarded by explicit `select`.

### Phase D — Service composition + schema
- **Goal:** `feed.service.getFeed(userId, query, _now?)`.
- **Files:** `server/modules/feed/feed.service.ts`, `feed.schema.ts` (`feedQuerySchema`: `cursor z.string().optional()`, `limit z.coerce.number().int().min(1).max(50).default(20)`); `tests/unit/feed/feed.service.test.ts`.
- **Deliverables:** resolve `T0 = cursor.t ?? (_now ?? Date.now())`; **compute `windowStart = new Date(T0 − FEED_WINDOW_DAYS)` from frozen T0** and pass it to `getFeedCandidates`; `authorIds = unique([userId, ...getAcceptedFriendIds(userId)])`; `getFeedCandidates` → `rankPosts(_, T0)` → `sliceByCursor(_, cursor, limit, T0)`; map rows to `FeedPostResponse` (`streak?.current ?? 0`); build `nextCursor`; **on an empty first page set `emptyReason` = `friendIds.length === 0 ? 'NO_CONNECTIONS' : 'NO_RECENT_ACTIVITY'`** (omit otherwise). Inject `_now` for tests.
- **Acceptance:** §12 service tests pass (incl. T0-derived window and `emptyReason` A/B).
- **Risks:** (1) deriving `windowStart` from a live clock instead of T0 → F1 gap bug; (2) module-boundary violation → call `friends.service`, never `friends.repo`.

### Phase E — Controller + route
- **Goal:** HTTP surface.
- **Files:** `server/modules/feed/feed.controller.ts` (`handleGetFeed`); `app/web/app/api/feed/route.ts` (`export async function GET(request) { return handleGetFeed(request) }`); `tests/unit/feed/feed.controller.test.ts`.
- **Deliverables:** `requireAuth` → `validateQuery(feedQuerySchema)` → `getFeed` → `NextResponse.json({ posts, nextCursor, emptyReason? })`; `AppError`/`InternalError` mapping per the streaks-controller pattern; **controller boundary tests (401 / 400 / 200 / 500-no-leak) per §12.**
- **Acceptance:** §12 controller tests pass — 200 happy path; 401 unauth; 400 bad limit and malformed cursor; 500 maps unexpected errors without detail.
- **Risks:** forgetting the `instanceof NextResponse` guards on `requireAuth`/`validateQuery`.

### Phase F — Frontend
- **Goal:** Replace the placeholder with a working feed.
- **Files:** `app/web/hooks/useFeed.ts` (`useInfiniteQuery`, `queryKey: ['feed']`, `getNextPageParam: (last) => last.nextCursor ?? undefined`); `app/web/components/features/FeedCard.tsx`; rewrite `app/web/app/(main)/feed/page.tsx` (keep `StreakWidget`; add infinite scroll + skeleton/error states + the **two empty states**); wire feed invalidation into the existing `PENDING → VERIFIED` detection (`usePostStatus`).
- **Deliverables:**
  - infinite-scroll list; `FeedCard` (photo, avatar, username, streak count, workout type, caption, timestamp);
  - **two empty states driven by `emptyReason`:** `NO_CONNECTIONS` → "Add friends…" + (inert) Find-Friends CTA; `NO_RECENT_ACTIVITY` → "No recent workouts yet…" with no CTA (§4);
  - **`FeedCard` null-safety + formatting:** null `avatarUrl` → placeholder/initial; null `caption` → omit; `createdAt` → relative time via a shared formatter (§4);
  - **cache invalidation:** on a viewer's own post reaching `VERIFIED`, call `queryClient.invalidateQueries({ queryKey: ['feed'] })` so the fresh own post surfaces.
- **Acceptance:** scrolling loads pages; both empty states render for the correct `emptyReason`; loading/error states render; null avatar/caption handled; own post appears after its `VERIFIED` transition; no auth tokens touched.
- **Risks:** **Next.js API drift** — per `app/web/AGENTS.md`, read `node_modules/next/dist/docs/` before writing any Next.js/route/hook code; don't assume training-data APIs.

### Phase G — DoD verification
- **Goal:** prove `goals.md` DoD: friends-only (+ own) verified posts; pagination works; no data leaks; deterministic ranking.
- **Deliverables:** full `npm run test` green; isolation + pagination integration tests green; manual smoke (seed two friends + a non-friend, confirm the non-friend is invisible and pages stitch).
- **Acceptance:** all green; isolation manually confirmed.
- **Update on completion:** mark Slice 5 ✅ in CLAUDE.md §11 and add a Completed-Slice note.

---

## Self-Review (mandatory)

| Lens | Verdict |
|---|---|
| **Simplicity** | Pull/read model, no materialization, no event handler, no new infra/tables. Two queries per page. Ranking & cursor are pure functions. *Removed during review:* a `FeedItem` materialized table + `WORKOUT_VERIFIED` handler (over-engineering, and would violate the no-new-tables constraint) and a SQL `$queryRaw` ranker (untyped, less testable). |
| **Correctness** | Frozen T0 governs **both** scoring and the candidate window (§8/§10), and the `(score, id)` total order gives stable pagination **under a fixed author set + fixed streak inputs** — an explicitly bounded, honest guarantee (live streak/friend-graph changes can shift one item by one position; accepted for MVP, §8). Authorization is re-derived per request and is cursor-independent ⇒ no leak. Null-streak, future-skew, empty-cursor, out-of-bounds-`t`, and candidate-cap-truncation edges are all handled and tested. |
| **Scalability** | Bounded by `FEED_WINDOW_DAYS` + candidate `cap`. Honest MVP ceiling (~hundreds–1.5k candidates) stated; future composite index and SQL/materialization path documented as *out of scope, architect-gated* rather than smuggled in. |
| **Testability** | Every non-trivial unit is a pure function or a mocked-persistence simulator — no live DB. Isolation and pagination have dedicated integration tests with explicit failure conditions. |
| **Product fit** | Delivers own ∪ friends' verified posts, recency-ranked with a streak boost that reinforces the retention loop — exactly the distribution layer `goals.md` Slice 5 specifies, and consistent with the locked ranking formula. |

**Residual complexity accepted for MVP:** re-fetching + re-ranking the full candidate set on every page (rather than keyset-in-SQL). At MVP candidate sizes this is negligible and buys a dramatically simpler, fully-testable design; the migration path is documented for when metrics justify it. No further simplification warranted.

---

## Section 14 — Forward-Compatibility & Deferred Register

A single auditable list of everything intentionally **not** built in this slice, with where it is handled and what triggers it. Nothing here blocks Slice 5 implementation; each is a tracked, deliberate deferral.

| Item | Status | Where addressed | Trigger / owner |
|---|---|---|---|
| **Friendship mutations** (request/accept/reject/remove) | Out of scope | §3, §6 | Slice 6. Must preserve the `getAcceptedFriendIds` signature (§6). |
| **Directional `BLOCKED` modelling** (asymmetric block on a symmetric single-row schema) | Flagged, not solved | §6 | Slice 6 design — feed's `ACCEPTED`-only read is safe regardless. |
| **`emptyReason` in `API_CONTRACTS.md`** | Doc-sync pending | §4, §9 | Update `API_CONTRACTS.md` `GET /api/feed` when this revision is ratified (doc only, no code). |
| **Rate limiting on `GET /api/feed`** | Deferred | §11 | Gated on app-wide Redis/Upstash limiter (in-memory limiter is ineffective on serverless). ~60/min/user when added. |
| **Mobile client auth** (bearer-token instead of cookie) | Assumption documented | §11 | App-wide React Native work; cursor + JSON contract already mobile-clean. |
| **Image thumbnail/variant URLs** | Deferred | — | Feed returns full `imageUrl`; add a transform layer when bandwidth/UX warrants. |
| **Composite index** `Post(userId, status, createdAt desc)` | Out of scope (schema change) | §10 | Architect approval + a future migration slice. |
| **Keyset-in-SQL / materialised feed** | Out of scope | §10, §13 | Candidate sets outgrow memory, or `FEED_CANDIDATE_CAP` is frequently hit (§10 trigger 3). |
| **Pagination input-freezing** (freeze streak/author inputs, not just T0) | Accepted gap | §8 | Same trigger as materialised feed; until then, the one-item-shift edge is accepted. |
| **`FEED_CANDIDATE_CAP` truncation** (oldest-beyond-cap unreachable per snapshot) | Bounded, tested | §8, §10, §12 | Re-evaluate retrieval when cap-hit rate climbs (instrument first). |
| **True pull-to-refresh gesture** | Deferred | §3 | Ships as a manual refetch / `['feed']` invalidation for MVP. |
| **Comments / likes / reactions / profiles / post-detail** | Out of scope | §3 | Future slices. |

**Constants to define in `shared/constants/index.ts` (Phase B):** `FEED_RECENCY_HALFLIFE_HOURS = 24`, `FEED_STREAK_BOOST_DIVISOR = 100`, `FEED_STREAK_BOOST_CAP = 0.5`, `FEED_WINDOW_DAYS = 30`, `FEED_CANDIDATE_CAP = 500`, `FEED_DEFAULT_LIMIT = 20`, `FEED_MAX_LIMIT = 50`.
