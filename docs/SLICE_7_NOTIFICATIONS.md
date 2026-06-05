# Slice 7 — Notifications: Design & Execution Blueprint

> Grounded in the current repo. **Already exists** (Slice 6 write-path): `Notification` model, `notifications.repo.createNotification` (idempotent upsert on `@unique idempotencyKey`), in-process `eventBus` (`EventEmitter`), append-only `Event` table via `persistEvent`. **Net-new in Slice 7**: the dispatcher (currently a throwing stub), the read APIs, the bell + center UI, and decoupling the domain from the notification layer.

---

## 0. Current state → target (what changes)

| Concern | Today | Slice 7 |
|---|---|---|
| Event→notification mapping | `friends.service` calls `createNotification(...)` inline with hardcoded titles | a **dispatcher** owns the mapping; domain only emits events |
| Idempotency | ad-hoc keys (`friendship:{id}:FRIEND_REQUEST`) | one formal key contract |
| Read path | none | `GET /notifications`, unread-count, `POST /notifications/read` |
| UI | none | bell + badge (in `MainNav`) + `/notifications` center |
| Delivery | synchronous, best-effort | synchronous dispatcher now; **outbox poller** documented as the scale path |

---

## 1. SYSTEM DESIGN OVERVIEW (layers)

**Strict separation: domain never knows about notifications.** Domain services emit domain events; the notification layer subscribes/maps. Five layers:

1. **Event source layer (domain).** `friends.service`, `streaks.service`, etc. perform a state change and emit a `DomainEvent` (e.g. `FRIEND_REQUEST_SENT`). They do **not** construct notification titles or call `createNotification`. (This *removes* the current direct calls — the key decoupling.)
2. **Dispatcher (notification layer).** `notifications.dispatcher.ts` — a **pure mapping** `mapEventToNotifications(event) → NotificationSpec[]` + a thin `dispatch(event)` that calls `createNotification` for each spec. The *only* place that knows "FRIEND_REQUEST_SENT → notify the recipient with this title and this idempotency key." Adding likes/comments later = adding map cases, nothing else.
3. **Storage layer.** `notifications.repo` (Prisma). Idempotent writes (upsert on `idempotencyKey`); cursor reads; batch mark-read scoped to owner.
4. **API layer.** Thin controllers + routes: list (cursor + unread count), unread-count, mark-read. Auth + Zod + rate-limit, per existing module convention.
5. **UI layer.** `NotificationBell` (badge in `MainNav`) + `/notifications` center page, driven **only** by the API (TanStack Query). Deep-links come from the notification's `data` JSON — UI never imports domain code.

**Dispatch execution — decision:**
- **Slice 7 MVP = synchronous in-request dispatch.** After the domain mutation commits, the service calls `dispatch(event)` (fire-and-forget with logging, mirroring today's pattern). Reliable on Vercel serverless (the in-process `EventEmitter` is per-instance and unreliable across cold starts, so we do **not** depend on it for delivery), simple, and reuses the idempotent write.
- **Scale path = transactional outbox + poller.** Write the event row to the `Event` table **in the same transaction** as the mutation (this also fixes the flagged Slice 6 "events are best-effort" gap); the existing `notificationDispatcher.ts` worker polls undispatched events, runs the same `dispatch()`, marks them dispatched. At-least-once delivery × idempotency = **effectively-once**. Same dispatcher code, swapped trigger.

Either mode satisfies "no duplicates under retry/replay" (idempotency key); the outbox adds durability. **Recommendation: ship synchronous now, keep the dispatcher pure so the outbox is a trigger swap, not a rewrite.**

---

## 2. DATA MODEL

`Notification` already exists and is correctly shaped — **no structural change required**:

```prisma
model Notification {
  id             String           @id @default(cuid())
  userId         String           // RECIPIENT
  type           NotificationType
  title          String
  body           String?
  data           Json?            // deep-link payload: { fromUserId, friendshipId, postId, ... }
  read           Boolean          @default(false)
  idempotencyKey String?          @unique   // dedup under retry/replay (DB-enforced)
  createdAt      DateTime         @default(now())
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read, createdAt(sort: Desc)])   // exists — unread filter/count
  @@index([userId, type])                          // exists
}
```

**Two changes (small migrations):**
1. `@@index([userId, createdAt(sort: Desc)])` — for the chronological **list** query (`WHERE userId ORDER BY createdAt DESC`); the existing composite leads with `read`, so it can't serve the all-statuses list as a clean range scan.
2. `enum NotificationType` add **`SYSTEM`** (future-proofing/announcements). `FRIEND_REQUEST`, `FRIEND_ACCEPTED` already exist; `WORKOUT_VERIFIED`, `FRIEND_POSTED`, `STREAK_*` exist for later wiring.

**Idempotency constraint (the core guarantee):**
- **Key structure:** `idempotencyKey = ${type}:${subjectId}:${recipientId}` — deterministic from the domain event. `subjectId` = the entity the notification is *about* (friendshipId, postId). `recipientId` makes it unique per recipient for fan-out events (R7 notify-each-friend, future FRIEND_POSTED).
  - `FRIEND_REQUEST:{friendshipId}:{recipientId}`
  - `FRIEND_ACCEPTED:{friendshipId}:{requesterId}`
- **Storage strategy:** the value lives in `Notification.idempotencyKey` with a **`@unique`** index (global uniqueness is correct because `recipientId` is *in* the key).
- **Collision handling:** `prisma.notification.upsert({ where:{ idempotencyKey }, update:{}, create:{...} })` — a duplicate is a **silent no-op** (the existing repo already does this). Retry, concurrent double-fire, and full event replay all converge to exactly one row. No app-level locking.

---

## 3. EVENT FLOW (lifecycle)

**Example: A sends B a friend request.**
1. **Action:** `POST /api/friends/request` → `friends.service.sendFriendRequest(A, B)`.
2. **Domain commit:** creates the `Friendship(PENDING)` row (`friendshipId`).
3. **Emit:** service calls `dispatch({ type: FRIEND_REQUEST_SENT, payload:{ friendshipId, fromUserId:A, toUserId:B } })`. (It no longer builds the notification itself.) In outbox mode this is instead a row in `Event` written in the same tx.
4. **Map:** dispatcher's `mapEventToNotifications` → `[{ recipientId: B, type: FRIEND_REQUEST, title:"@A wants to be friends", data:{ fromUserId:A, friendshipId }, idempotencyKey:"FRIEND_REQUEST:{friendshipId}:B" }]`.
5. **Idempotency check + write:** `createNotification` upserts on the key — first call inserts, any retry/replay is a no-op.
6. **UI fetch:** B's `NotificationBell` poll (`GET /notifications/unread-count`) returns `1`; B opens `/notifications` (`GET /notifications`) → sees the row; tapping it deep-links to `/friends` via `data`.
7. **Read:** `POST /notifications/read { all:true }` (or `{ids:[...]}`) flips `read=true`; unread count → 0.

**Replay safety:** re-running step 3 for the same `friendshipId`/recipient (retry, double-emit, or outbox redelivery) re-derives the **same** key → upsert no-op → still one notification.

---

## 4. API DESIGN

All: `requireAuth`; owner-scoped (`userId = auth.userId`); cursor-only (no offset); errors via `AppError` (401/400/429/500, never leak internals).

### `GET /api/notifications?cursor=&limit=`
```
200 {
  notifications: [{ id, type, title, body, data, read, createdAt }],
  nextCursor: string | null,
  unreadCount: number
}
```
Keyset cursor on `(createdAt DESC, id DESC)`; `limit` default 20, max 50. `unreadCount` included so the center renders without a second call.

### `GET /api/notifications/unread-count`  *(small addition, justified)*
```
200 { count: number }
```
Cheap query for the global bell badge (poll on window-focus / ~60s), so the badge never loads the list. `count(where userId, read=false)` — served by `@@index([userId, read, createdAt desc])`.

### `POST /api/notifications/read`  *(batch — design decision)*
```
Request:  { ids: string[] }  |  { all: true }
200 { unreadCount: number }   // new count after marking
```
**Decision: batch, not per-id** — the center marks everything visible (or all) in one call; avoids N requests. `updateMany({ where:{ userId, read:false, ...(ids ? { id:{ in: ids } } : {}) }, data:{ read:true } })`. **Owner-scoped `where userId`** means another user's id simply matches 0 rows — no 403/404, no existence leak. Idempotent (already-read → 0 rows updated). Zod: exactly one of `ids` (1–100) or `all`.

---

## 5. FRONTEND DESIGN

**Decoupling rule:** components call the notifications API via hooks only; deep-links are derived from `notification.data` (e.g. `FRIEND_REQUEST` → `/friends`, future `POST_LIKED` → `/p/{postId}`) — no domain imports.

- **`NotificationBell`** (in `MainNav`, alongside Feed/Friends): bell icon + unread badge. Badge from `useUnreadCount` → `useQuery(['notifications','unread'])` hitting `/unread-count`, `refetchOnWindowFocus`, ~60s interval. Caps display at `9+`. Links to `/notifications`.
- **Unread-count logic:** single source = the `/unread-count` query. After mark-read or opening the center, invalidate `['notifications','unread']` so the badge updates immediately (optimistic set to 0 on "mark all read").
- **`/notifications` center page:** `useNotifications` (`useInfiniteQuery`, `['notifications']`, `staleTime 30s`) → list of `NotificationItem` (icon by `type`, title/body, relative time, unread dot, deep-link on click). Infinite scroll via the existing IntersectionObserver pattern. States: loading skeleton, error+retry, empty ("You're all caught up"). A "Mark all read" action → `POST /read {all:true}` (optimistic). Opening the center optionally fires `{all:true}` or marks-on-click — **decision: explicit "Mark all read" + mark-on-click** (don't silently clear on mount; users lose track of what's new).
- **Cache-invalidation contract** (mirrors `syncSocialGraph`): any read mutation invalidates `['notifications']` + `['notifications','unread']`. (The dispatcher is server-side, so newly-created notifications surface on the next poll/refetch — acceptable for MVP; real-time push is post-MVP.)

---

## 6. QA STRATEGY

**Unit (Vitest, mocked Prisma):**
- Dispatcher mapping: each `EventType` → correct `NotificationSpec[]` (recipient, title, deterministic idempotencyKey). Pure function → trivially testable.
- Idempotency: `createNotification` twice with same key → upsert called, one logical row (already partially covered).
- Mark-read: `updateMany` scoped to `userId`; another user's id → 0 rows; `all` vs `ids`; already-read → no-op.
- Unread count: correct `where read=false`.

**Integration (real test DB):**
- **Duplicate prevention:** call `dispatch(event)` twice for one event → exactly **1** `Notification` row.
- **Replay safety:** feed the same domain event N times (simulating outbox redelivery) → **1** row.
- **Race condition:** `Promise.all` of two `createNotification` with the same key → 1 row, no unhandled P2002 (upsert handles it; if create path is hit, map P2002 → no-op via `isUniqueConstraintError`).
- **Delivery correctness:** request→accept flow creates the right type to the right recipient with correct `data`; the other party gets none they shouldn't.
- **Read correctness:** mark-read affects only the owner; unread count exact before/after.

**Live smoke (extend `qa-friends.mjs` pattern):** two users → A requests B → assert B `GET /notifications` has `FRIEND_REQUEST` + `unread-count=1` → B `POST /read` → count 0 → B accepts → A has `FRIEND_ACCEPTED`. Cleans up.

**Load (basic):** unread-count + list both index-backed; list cursor-paginated (no offset); bell poll interval bounded (≥60s, on-focus) so N users ≠ hammering; mark-read is one `updateMany`, not N updates.

---

## 7. IMPLEMENTATION PLAN (ordered)

1. **DB schema** — migration: add `@@index([userId, createdAt(sort: Desc)])` + `NotificationType.SYSTEM`. (`Notification` model otherwise unchanged.) Regenerate client.
2. **Dispatcher** — `notifications.dispatcher.ts`: pure `mapEventToNotifications(event)` (FRIEND_REQUEST_SENT, FRIEND_REQUEST_ACCEPTED to start; structured for likes/comments) + `dispatch(event)` calling `createNotification`. Formalize the `${type}:${subjectId}:${recipientId}` key. Unit-test the map.
3. **Event hooks (decoupling)** — replace the inline `createNotification` calls in `friends.service` with `dispatch(<event>)`; domain stops building titles. (Optionally register `dispatch` on `eventBus` for the 4 already-bused events.) Keep synchronous best-effort for MVP.
4. **APIs** — `notifications.{repo,service,schema,controller}.ts` (fill the stubs): `getNotifications` (cursor + unreadCount), `getUnreadCount`, `markRead` (batch/all, owner-scoped). Routes `app/web/app/api/notifications/{route,unread-count/route,read/route}.ts`. Auth + Zod + rate-limit. Shared response types in `shared/types/notifications.ts`. Sync `API_CONTRACTS.md` + `EVENT_CATALOG.md`.
5. **Frontend** — `notifications.api.ts`; `useNotifications` + `useUnreadCount`; `NotificationBell` in `MainNav`; `/notifications` center page + `NotificationItem`; invalidation contract; deep-links from `data`.
6. **QA validation** — unit + integration suites above; extend the live smoke; run type-check + build + full suite + lint; document in `CLAUDE.md` QA Commands.

**Build order rationale:** schema → dispatcher (pure, testable) → decouple domain → APIs (UI contract) → UI (built straight from the frozen API) → QA. UI is never blocked on domain internals; the API is the contract.

---

## Success-criteria check
- **No duplicates under retry/replay** → deterministic `idempotencyKey` + `@unique` upsert no-op (DB-enforced, not app-enforced).
- **Scales to future events** → adding likes/comments/shares = new cases in one pure `mapEventToNotifications`; no domain or UI changes.
- **UI buildable directly from the API** → list+unread-count+read fully specify the bell/center; `data` carries deep-links; zero domain coupling.

## Deferred (explicitly out of Slice 7)
Transactional outbox + background poller (durability — fixes the Slice 6 best-effort gap); real-time push (WebSocket/SSE) — MVP polls; per-type user preferences/mute; email/push transports.
