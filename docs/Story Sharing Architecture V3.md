# BeActive Story Sharing — Architecture V3

## Production Implementation Blueprint

> **Status:** Blueprint for execution (2026-06-11)
> **Author intent:** Staff-engineer-grade redesign. Reliability and growth first, polish second.
> **Supersedes:** the *architecture* in `docs/BeActive Story Sharing.md` (v1.0, Phase 1). The product
> vision, design language, and safe-area system in that doc remain valid and are reused.
> **Audience:** the human founder + the 8 Sonnet implementation agents defined in §24.
> **Golden rule of this doc:** *the system must work before it is beautiful.* Every recommendation
> is optimized for reality (a solo founder on Vercel + Supabase + Cloudflare R2), not for a demo.

---

## 0. How to read this document

This is a **blueprint**, not an essay. It is structured so each Sonnet subagent can lift its own
section and implement with minimal ambiguity. Where a decision is made, it is stated as a decision
with the tradeoff named. Where the current code is wrong, the file and line are cited.

Three things to internalize before anything else:

1. **A story card is a pure function of an immutable payload.** If we snapshot the inputs at the
   moment of verification, the rendered PNG never needs to change. This single idea unlocks caching,
   pre-generation, free CDN delivery, and reliability. The current system throws this away by
   rendering against *live* streak data on every tap.

2. **The mobile web cannot deep-link into Instagram Stories.** Anyone who tells you otherwise is
   thinking of a native app. The honest web ceiling is the OS share sheet (`navigator.share`). We
   ship that now and design the payload so the future React Native app can do true native Story
   sharing later. §14 is blunt about this so nobody wastes a sprint chasing it.

3. **The current generation pipeline is unreliable for four concrete, fixable reasons** (§4). None
   require a rewrite of the visual system. They require moving the render off the request hot path,
   removing all network calls from inside the render, and persisting the result.

---

## 1. Executive Summary

BeActive turns each verified workout into a 1080×1920 story card that users share to Instagram /
Telegram / Snapchat. Today the card is rendered **on demand, on the request hot path, against live
data, with no caching, no persistence, no analytics, and hidden network calls inside the renderer.**
It looks good when it works (the visual system in `lib/story-card/` is genuinely strong) but it
fails intermittently and is invisible to measurement.

**The V3 architecture changes one thing structurally:** it treats the card as a **content-addressed,
immutable asset** built from a **snapshotted payload**, rendered **once**, **off the hot path**, and
served **from the Cloudflare R2 CDN for free, forever.**

```
Workout VERIFIED
  → snapshot StoryPayload (streak/plant/type/image at THIS instant)   [new, durable]
  → pre-render PNG off the response path, write to R2                  [cache-warm]
  → share button points at a STABLE asset URL
  → tap = CDN hit (no compute), or lazy render-once if cold           [cache-aside]
  → Web Share API → Instagram/Telegram (native app does true Stories) [honest]
  → friend sees card → installs BeActive                              [the funnel]
```

**Recommendation in one line (full detail in §25):** *Snapshot at verify-time → render-once with a
zero-network Satori pipeline → persist to R2 → serve immutable from CDN, with on-demand lazy render
as the durable fallback and pre-generation as a cache-warm optimization.* This is the cheapest,
most reliable design that scales from 10 to 100,000 users/month with **no rewrite** — only the
*trigger* for pre-generation changes (inline `after()` → durable queue) as volume grows.

**Cost at 100k cards/month:** dominated by ~100k one-time renders (compute measured in single-digit
dollars on Fluid Compute) and **$0 CDN egress** (R2 has no egress fees). See §19.

---

## 2. Product Goals

| # | Goal | Measurable target | Why it matters |
|---|------|-------------------|----------------|
| P1 | Share works every time | ≥ 99.5% of share taps produce a usable card | Trust. A failed share at the emotional peak kills the loop. |
| P2 | Share is instant | p95 tap→card ≤ 800ms (warm), ≤ 3s (cold render) | Latency at the peak = abandonment. |
| P3 | Card is truthful | Card reflects the streak **as it was when earned** | A card that shows "today's" streak on an old post is a lie and erodes trust. |
| P4 | Card is on-brand | BeActive mark always legible; IG safe zones respected | The card is an ad; the brand must survive a 2-second glance. |
| P5 | Zero data lies | No fake metrics, no placeholder numbers, ever | Founder constraint. Every number is real or absent. |
| P6 | Owner-only | A user can only generate cards for their own VERIFIED posts | Security + privacy. Already enforced; must stay enforced. |

**Explicit non-goals for V3:** animated/video cards, BeActive Wrapped, multi-template milestone
cards. These are designed in §23 but **not built**. V3 is the reliable static-card foundation they
will sit on.

---

## 3. Growth Goals

The story card is the **primary top-of-funnel acquisition engine** — organic, zero ad spend. The
architecture must make the viral loop *measurable* and *frictionless*.

| # | Growth lever | Architecture requirement |
|---|--------------|--------------------------|
| G1 | Every share is branded | Brand mark baked into the immutable PNG (can't be cropped out of the data, only the image). |
| G2 | Measure the funnel | Persist `STORY_GENERATED / SHARE_TAPPED / SHARED / DOWNLOADED` events (§18). Today: **none wired.** |
| G3 | Attribution | Each card carries a stable `shareId`; install deep-links (`?ref=story&sid=…`) close the loop (§18). |
| G4 | Frictionless re-share | Re-tapping never re-pays compute — the asset is cached. Encourages multi-platform sharing. |
| G5 | Rarity = virality | Plant-evolution and milestone moments are the highest-converting; the payload flags them so a future template can special-case them (§12, §23). |

**The funnel we are instrumenting:**
```
workout_verified → story_generated → share_tapped → shared → (viewer) link_click → signup(ref=story)
```
Each arrow is an event with a `shareId` / `postId` join key. Without G2 we are flying blind; wiring
it is non-negotiable in V3.

---

## 4. Failure Analysis of the Current Approach

This section is the audit. Each finding cites the real file. **These are the reasons generation is
unreliable** — and none of them are visual.

### 4.1 🔴 CRITICAL — Uncontrolled network calls *inside* the renderer (emoji)

`app/web/app/api/stories/generate/route.tsx:102` constructs
`new ImageResponse(cardElement, { width: 1080, height: 1920, fonts })` — **with no `emoji`
option.** But the card renders emoji everywhere:

- `StoryCard.tsx:146` — ✅ verified badge at 66px
- `StoryCard.tsx:211` — plant emoji 🌱🌿🪴🌲🌳🎄🌸 at 58px
- `StoryCard.tsx:138` — workout icon 🏋️🏃🚴🏊🌄⚽💪 at 32px

In `next/og`, emoji are not in the bundled fonts. Satori resolves each emoji by **fetching its SVG
from a CDN** (twemoji via jsdelivr, by default). So **every render makes 3–5 outbound HTTP calls
from inside the lazy Satori stream.** This is the *exact* failure mode the team eliminated for fonts
(`lib/story-card/font.ts` — "No render-time network fetch → also removes the CDN-timeout failure
mode entirely") and for the workout photo (`route.tsx:18 toDataUri()` — "Satori never makes an
outgoing HTTP request during render"). The emoji path was missed. Because `ImageResponse` renders
**lazily during body streaming** (documented at `route.tsx:104-107`), a twemoji fetch timeout throws
*after* the route's try/catch has returned — crashing the worker with an empty reply. **This is the
most likely single cause of intermittent failures.**

> Fix (§10): provide a local emoji resolver / inline the handful of glyphs we use as bundled
> assets, OR replace decorative emoji with the existing brand SVG illustrations
> (`components/features/PlantIllustrations.tsx` already draws every plant tier as pure SVG paths).
> Zero network during render is the invariant.

### 4.2 🔴 CRITICAL — No `maxDuration` / no `runtime` pin

`generate/route.tsx` declares neither `export const runtime` nor `export const maxDuration`. It uses
`node:fs` (via `font.ts`), so it correctly defaults to the Node runtime — but the **timeout is the
platform default.** On the Vercel Hobby plan that is **10s** (CLAUDE.md §18 notes this explicitly).
The cold-path work is: 3 DB round-trips (`Promise.all` of post/streak/profile) + `loadStoryFonts`
(disk) + **full-size** image fetch + base64 + emoji CDN fetches + Satori layout + PNG encode. On a
cold start with a large photo and slow twemoji CDN, this can exceed 10s → 504, no card.

> Fix: pin `export const runtime = 'nodejs'` and `export const maxDuration = 60` on any on-demand
> render route, and move the render off the hot path entirely (§10) so the user never waits on it.

### 4.3 🟠 HIGH — Full-size image fetched and base64-encoded every render

`route.tsx:72-75` calls `toDataUri(post.imageUrl)` on the **original** R2 upload. Uploads are EXIF-
stripped and cropped client-side (`react-easy-crop`) but **not guaranteed downscaled** — a modern
phone photo is 2–8 MB. base64 inflates that ~33% in memory, and Satori must decode the full
resolution only to draw it into a 936×620 box. This is wasted latency, wasted memory, and an OOM
risk under concurrency. **We are feeding a 4000px image into a 936px slot.**

> Fix (§7, §8): at verify time, generate a small **story-source variant** (936×620 cover,
> ~80–150 KB WebP/JPEG) and render from that. The render reads a tiny image.

### 4.4 🟠 HIGH — No caching; card re-rendered on every tap

`route.tsx:114` sets `'cache-control': 'private, no-store, max-age=0'`. Every tap — including the
common "tapped share, dismissed the IG sheet, tapped again" — re-runs the **entire** pipeline. This
is simultaneously the cost problem and the reliability problem: we pay full compute for an asset
that is logically immutable, and we re-roll the dice on every failure mode above each time.

> Fix (§11): the card is immutable once its payload is snapshotted. Persist the PNG to R2 and serve
> `public, max-age=31536000, immutable`. Re-taps become free CDN hits.

### 4.5 🟠 HIGH — Card bound to *live* mutable streak data (P3 violation)

`route.tsx:65-66` reads `streak.current` / `streak.best` **at generation time.** Share a 3-day-old
post and the card shows *today's* streak, not the streak you had when you earned that workout. This
is (a) a correctness bug — the card lies — and (b) the root reason the card *cannot* be cached:
its inputs are mutable. Snapshotting the payload at verify-time fixes both at once.

### 4.6 🟡 MEDIUM — Story logic lives in the route; the module is an empty stub

`server/modules/stories/stories.service.ts` is literally `export type {}`. The repo, controller,
and schema are stubs too. **All real logic is inline in the API route** (`route.tsx`), violating the
project's own layering rule (CLAUDE.md §13: controller → service → repo). There is no place to put
the payload builder, the persistence, or the events. V3 fills this module.

### 4.7 🟡 MEDIUM — Zero persistence, zero analytics, zero attribution

No `Story` table, no `ShareEvent`, no wired events. The v1.0 doc lists the events (§8 there) and
says "not wired." So we **cannot answer "does sharing work in production?"** or "how many installs
came from stories?" The viral engine is unmeasured.

### 4.8 🟡 MEDIUM — No pre-generation at the emotional peak

The user hits `recorded` stage (`upload/page.tsx:388`, share button at `:443`) seconds after the
`after()` AI classifier verifies the post (`posts/create/route.ts:30`). That gap is free time we
could use to pre-render. Today the render only starts on tap, adding multi-second latency at the
exact moment we want zero friction.

### 4.9 ⚪ ACCEPTED — Web Share API is not Instagram-Story deep-linking

`StoryShareButton.tsx:69` calls `navigator.share({ files })`. This opens the OS share sheet; the
user then picks Instagram and lands in IG's composer. It does **not** pre-fill an IG Story with a
background+sticker. That capability is native-app-only (§14). This is a platform limit, not a bug —
documented so it's never mistaken for one.

**Summary:** the visual system is fine. The *delivery architecture* is the problem. V3 keeps the
pixels and rebuilds the plumbing.

---

## 5. Story Generation Pipeline (target design)

Two paths share one renderer. The renderer is pure and network-free; the trigger differs.

```
┌────────────────────────────── WRITE PATH (once per workout) ──────────────────────────────┐
│  WORKOUT_VERIFIED event (R4)                                                                │
│    → buildStoryPayload(postId)         // snapshot streak/plant/type/image/identity NOW     │
│    → persist Story row (payload JSON, status=PENDING_RENDER)                                │
│    → renderStoryPng(payload)           // pure Satori, ZERO network (fonts+img+emoji local) │
│    → putObject R2: stories/{postId}/{shareVersion}.png  (immutable)                         │
│    → Story.status=READY, Story.assetUrl=<cdn>                                               │
│    → emit STORY_GENERATED                                                                   │
│  (runs in after()/queue — best-effort cache-warm; NOT on the user's request path)          │
└────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────── READ PATH (every share/tap) ───────────────────────────────┐
│  GET /api/stories/{postId}.png   (or client reads Story.assetUrl directly)                  │
│    → if R2 object exists  → 200 stream / 302 to CDN   (cache-aside HIT, no compute)         │
│    → else (cold/failed warm) → render-once → putObject → return PNG  (durable fallback)     │
│    → Cache-Control: public, max-age=31536000, immutable                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this shape:**
- The **read path is what users feel**, and it is a CDN GET that essentially cannot fail.
- The **write path is best-effort**; if pre-render fails, the first read renders-and-persists. So
  reliability does not depend on the warm step succeeding — it only depends on the *renderer* being
  correct (network-free) and the *fallback* existing.
- The renderer is identical in both paths (one `renderStoryPng(payload)` function), so there is one
  code path to test and harden.

**The renderer contract (the thing that must never make a network call):**
```ts
// server/modules/stories/stories.render.ts
async function renderStoryPng(payload: StoryPayload): Promise<Buffer> {
  const fonts = await loadStoryFonts()          // local disk (exists today)
  const emoji = loadLocalEmoji()                // NEW: local resolver, no twemoji CDN
  const el = <StoryCard {...toCardProps(payload)} />  // payload.imageDataUri already inlined
  const img = new ImageResponse(el, { width: 1080, height: 1920, fonts, emoji })
  return Buffer.from(await img.arrayBuffer())   // force render → catch errors (pattern exists)
}
```

---

## 6. Upload Pipeline (current → target)

### Current (verified by audit — keep this; it is good)
```
upload/page.tsx state machine: select → preview → uploading → verifying → recorded
  1. client: crop (react-easy-crop) + strip EXIF (canvas) → Blob
  2. POST /api/uploads/sign  → presigned R2 PUT url + key   (uploads/sign/route.ts → lib/storage/r2.ts)
  3. client: XHR PUT blob → R2 (progress bar)
  4. POST /api/posts/create { imageKey, caption }           (posts/create/route.ts)
       → createPost() persists Post(status=PENDING)
       → after(): processUploadedPost() classifies → VERIFIED/REJECTED/PENDING
  5. client polls post status → 'recorded' on VERIFIED → <StoryShareButton/>
```
This flow is sound. EXIF stripping, presigned direct-to-R2 upload, and post-response AI via
`after()` are all correct. **V3 does not touch steps 1–4.**

### Target addition (one hook + one variant)
- **At verify-time** (inside the classifier's VERIFIED branch / R4 rule), additionally:
  - generate the **story-source image variant** (§8) from `imageKey`,
  - call `buildStoryPayload` + `renderStoryPng` + persist (the write path of §5).
- That is the *only* change to the upload pipeline. Everything else is reused.

---

## 7. R2 Architecture

R2 is already the image store (`lib/storage/r2.ts`). V3 extends the key namespace; it does **not**
change credentials, the client, or the presign flow.

### Bucket layout (one bucket, prefix-partitioned)
```
posts/{userId}/{uuid}.{ext}            # original upload (exists)
avatars/{userId}/{uuid}.{ext}          # avatar (exists)
story-src/{postId}.webp                # NEW: 936×620 cover, render input (~80–150 KB)
stories/{postId}/{shareVersion}.png    # NEW: final 1080×1920 card (immutable, CDN-served)
```

### Access model
| Object | Write | Read | Cache-Control |
|--------|-------|------|---------------|
| `posts/*`, `avatars/*` | presigned PUT (client) | public CDN | existing |
| `story-src/*` | server (service key) | server-only (render input) | `private` |
| `stories/*` | server (service key) | **public CDN** | `public, max-age=31536000, immutable` |

### Key decisions
- **`stories/{postId}/{shareVersion}.png` is content-addressed by `(postId, shareVersion)`.** Because
  the payload is snapshotted, this object is immutable. `shareVersion` (int on the `Story` row)
  exists only so we can *intentionally* invalidate (e.g., a template redesign) by bumping it — never
  for data changes.
- **R2 egress is free.** This is the entire cost argument for serving cards from R2 vs re-rendering.
- **Server-side writes use the existing S3 client** (`getR2Client()` in `r2.ts`); add `putObject` +
  `objectExists` (HEAD) helpers next to the existing `deleteObject`.

---

## 8. Image Storage Strategy

The render must read a **small** image (§4.3). Strategy:

1. **Generate a story-source variant at verify-time.** From `posts/{userId}/{uuid}`, produce a
   936×620 (the card's `CARD_W` × `PHOTO_H`, `StoryCard.tsx:67-68`) cover-cropped, quality-tuned
   WebP/JPEG, written to `story-src/{postId}.webp`.
2. **Resizing tool:** Next 16 bundles `sharp` for its own image optimization, but it is not a public
   dep here. Two options, in order of preference:
   - **(A) `sharp` in the Node render runtime.** Cheapest deterministic path: add `sharp` as a dep
     (the standard, fast, libvips-backed choice) and downscale once. ~10–30ms per resize.
   - **(B) Cloudflare Image Resizing / R2 transform** at the CDN edge (`/cdn-cgi/image/...`) if
     enabled on the account — zero server compute, but a Cloudflare feature-flag dependency.
   - **Decision:** ship **(A) `sharp`** for determinism and zero external feature dependency; note
     **(B)** as a scale optimization.
3. **Inline as data URI for the render.** `renderStoryPng` reads `story-src/{postId}.webp` (small)
   → base64 → passes as `payload.imageDataUri`. Same `toDataUri` discipline as today, but on a
   150 KB file instead of a 5 MB one.
4. **Avatar:** same treatment, but avatars are already small; downscale to 128×128 once
   (`story-src/avatar/{userId}.webp`) or reuse the existing avatar URL through `toDataUri`.

> **Invariant:** the render input images live in R2 and are read server-side; the renderer never
> fetches a public URL. This preserves the zero-network-render guarantee.

---

## 9. Story Payload Architecture

**This is the keystone of V3.** Snapshot everything the card needs into an immutable payload at
verify-time. The card becomes a pure function of this payload.

### The payload (snapshotted — never reads live data again)
```ts
// server/modules/stories/stories.types.ts
export interface StoryPayload {
  // identity / addressing
  shareId: string            // stable public id (cuid) — used in URLs, attribution, analytics
  postId: string
  userId: string
  shareVersion: number       // bump to force re-render on template change (default 1)

  // immutable content snapshot (the whole point)
  imageKey: string           // story-src/{postId}.webp
  username: string
  avatarKey: string | null
  workoutType: WorkoutType   // GYM | RUNNING | ...
  streakCount: number        // streak.current AT VERIFY TIME (frozen)
  bestStreak: number         // streak.best  AT VERIFY TIME (frozen)
  isPersonalBest: boolean
  plantLevel: number         // 0–6, derived from frozen streakCount
  plantEmoji: string
  plantName: string

  // growth metadata (drives future templates + analytics priority)
  template: 'WORKOUT_COMPLETED' | 'STREAK_MILESTONE' | 'PLANT_EVOLUTION'
  isMilestone: boolean       // 7/14/30/50/100/200/365
  evolvedThisWorkout: boolean// plantLevel increased vs previous workout

  // provenance
  createdAt: string          // ISO; the moment of verification
}
```

### Persistence — new `Story` table (Prisma)
```prisma
model Story {
  id           String      @id @default(cuid())   // == shareId
  postId       String      @unique                // one card per post
  userId       String
  payload      Json                                // the StoryPayload above (snapshot)
  shareVersion Int         @default(1)
  status       StoryStatus @default(PENDING_RENDER)// PENDING_RENDER | READY | FAILED
  assetKey     String?                             // stories/{postId}/{v}.png once rendered
  assetUrl     String?                             // public CDN url
  renderMs     Int?
  renderError  String?                             // last failure (for retry/observability)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  post         Post        @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
  @@index([status])
}
enum StoryStatus { PENDING_RENDER  READY  FAILED }
```
- **`payload` as JSON** mirrors the existing `Event.payload Json` / `Notification.data Json` pattern
  — no schema churn when the card design evolves.
- **`postId @unique`** enforces one card per post (idempotent re-verify safe).
- The snapshot is **effectively immutable**: we only ever flip `status`/`assetUrl`, never the
  `payload` (except an explicit `shareVersion` bump).

### Decision: A) on-demand vs B) pre-render vs C) hybrid → **C, Hybrid**
| Option | Latency at tap | Cost | Reliability | Verdict |
|--------|----------------|------|-------------|---------|
| A. On-demand only | bad (render every tap) | high (N renders) | low (every tap re-rolls failures) | ❌ today's design |
| B. Pre-render only | great (if warm) | low | **fragile** — if warm fails, share has nothing | ❌ no fallback |
| **C. Hybrid (pre-render + cache-aside lazy)** | great | low (≈1 render/card) | **high** — warm is an optimization, lazy is the durable source of truth | ✅ **chosen** |

Hybrid = **pre-render warms the cache at the emotional peak; the read path renders-once-and-persists
if cold.** Best of both, and the failure of the optional half never blocks the user.

---

## 10. Rendering Architecture

**One renderer, network-free, Node runtime, off the hot path.** This section is the hardening spec.

### The four render invariants (violating any = the failures in §4)
1. **No network during render.** Fonts (local disk — exists), images (R2→base64, small — §8), and
   **emoji (local resolver — NEW, §4.1)**. Nothing fetches a public URL mid-stream.
2. **Force the lazy render inside try/catch.** Keep the existing `await image.arrayBuffer()` pattern
   (`route.tsx:108`) so a Satori throw is catchable, not a worker crash.
3. **Pin runtime + budget.** `export const runtime = 'nodejs'`, `export const maxDuration = 60`.
4. **No inline `<svg>` passed to Satori where it can crash** (the team already learned this —
   `StoryCard.tsx:142-144`). Use bundled raster/CSS shapes or vetted glyphs.

### Fixing emoji (the critical one) — choose ONE, in priority order
- **(Preferred) Replace decorative emoji with brand SVG drawn as Satori-safe primitives.** The plant
  tiers already exist as pure-path SVG in `components/features/PlantIllustrations.tsx`; port those
  shapes into the card so the plant is *on-brand and offline*. The ✅ badge becomes a CSS circle +
  check shape; the workout "icon" becomes a small bundled monochrome glyph set.
- **(Acceptable) Local emoji resolver.** Self-host the ~10 emoji SVGs we actually use into
  `lib/story-card/emoji/`, and supply a local resolver so Satori reads them from disk, never the
  CDN. (`next/og` supports a custom emoji source; if the installed version's API differs, the
  renderer must intercept emoji codepoints and substitute an inline `<img src={dataUri}>`.)
- **(Last resort) Pre-rasterize** the fixed glyph set to PNG data URIs at build time and map
  codepoint→dataUri in the card.

> The agent that owns rendering (§24, Agent 3) must verify, by network inspection, that a render
> makes **zero** outbound requests. That is the acceptance test.

### Where rendering runs
- **Write path:** a server service `renderStoryPng` invoked from the verify hook via `after()` (MVP)
  or a queue consumer (scale, §20).
- **Read path:** `GET /api/stories/[postId]/route.ts` — cache-aside: HEAD R2 → stream if present,
  else render+put+return.
- **Both call the same `renderStoryPng`.** Single hardened code path.

---

## 11. Cache Strategy

Three layers, all leaning on immutability.

| Layer | What | TTL / directive | Invalidation |
|-------|------|-----------------|--------------|
| **R2 object** | the rendered PNG | object is the cache; exists or not | delete on `shareVersion` bump |
| **CDN edge** (R2 public / Cloudflare) | the PNG bytes at edge | `public, max-age=31536000, immutable` | new key on version bump |
| **DB** (`Story.assetUrl`) | pointer to the asset | until version bump | update row |

- **The card is immutable**, so the strongest cache directives apply. This is *only* possible because
  the payload is snapshotted (§9). It is the direct fix for §4.4 and §4.5.
- **Cache key = `stories/{postId}/{shareVersion}.png`.** A redesign bumps `shareVersion` (globally or
  per-cohort) → new key → new asset, old asset harmlessly expires.
- **Never** `no-store` on a story asset again. The only `private`/no-cache surface is the *debug*
  preview route, which stays dev-only.

---

## 12. Template System

V3 ships **one** template (Workout Completed — the one in `StoryCard.tsx` today) but structures the
code so milestone/evolution templates slot in without touching the pipeline.

### Structure
```
lib/story-card/
  constants.ts            # safe-area, brand bg, plant ladder (EXISTS — keep)
  font.ts                 # local fonts (EXISTS — keep)
  emoji/                  # NEW: vendored offline glyphs (§10)
  StoryFrame.tsx          # IG safe-area wrapper (EXISTS — keep)
  templates/
    WorkoutCompleted.tsx  # = today's StoryCard.tsx body (rename/move)
    StreakMilestone.tsx   # FUTURE (designed §23) — not built
    PlantEvolution.tsx    # FUTURE — not built
  StoryCard.tsx           # dispatcher: switch(payload.template) → <Template/>
  StoryCardLive.tsx       # framer-motion live twin (EXISTS — keep in sync)
```
- **`payload.template`** already exists in the payload (§9). The dispatcher picks the component.
- **Template selection is decided at snapshot time** (verify), not render time, so it is frozen with
  the rest of the payload. Rules: `evolvedThisWorkout → PLANT_EVOLUTION`; else `isMilestone →
  STREAK_MILESTONE`; else `WORKOUT_COMPLETED`. (V3 maps all three to WorkoutCompleted until the
  others are built — but the *data* to choose is captured now.)
- **Two-renderer rule stays:** the static `StoryCard` (Satori) and the live `StoryCardLive`
  (framer-motion preview) must stay visually in sync — the established "two renderers, same
  composition" pattern (CLAUDE.md §18, Stories 8E).

---

## 13. Share Flow (target)

The button stops being a generator and becomes a **dispatcher of an existing asset.**

```
recorded stage (upload/page.tsx:443) → <StoryShareButton storyAssetUrl … />
  1. emit SHARE_TAPPED (analytics)
  2. resolve asset: prefer Story.assetUrl (warm). If absent → GET /api/stories/{postId} (lazy render).
  3. fetch the PNG blob (from CDN — fast, cached)
  4. if navigator.canShare({files}) → navigator.share({files:[card]})   → emit SHARED
       else → <a download> fallback                                     → emit DOWNLOADED
  5. AbortError (user dismissed sheet) = not a failure (existing handling, StoryShareButton.tsx:87)
```
- The button keeps its current states/UX (`StoryShareButton.tsx`) — only the data source changes
  from "generate now" to "fetch cached asset."
- Because the asset is cached, the **dismiss-and-retry** case (very common) is now instant and free.
- **Multi-platform buttons** (Instagram / Telegram / Snapchat / Save) can all point at the same
  cached blob — see §16.

---

## 14. Instagram Integration

**The honest version, so nobody burns a sprint.**

### Web (now) — the realistic ceiling
- `navigator.share({ files: [pngFile] })` opens the OS share sheet; user picks Instagram; IG opens
  its composer with the image attached. **This is the maximum the mobile web allows.** It is *not* a
  pre-filled IG Story with background+sticker layers.
- iOS Safari supports Web Share Level 2 (files); Android Chrome supports it. Desktop → download
  fallback. (Detection already correct: `StoryShareButton.tsx:28-37`.)
- **Ship this. It works. It is the funnel.**

### Native app (future) — true IG Stories
- True Story sharing (background image + sticker + attribution link) requires native intents:
  - **iOS:** write image to `UIPasteboard` with `com.instagram.sharedSticker.backgroundImage` +
    open `instagram-stories://share?source_application=<fb_app_id>`.
  - **Android:** `Intent ACTION_SEND` with `com.instagram.share.ADD_TO_STORY`,
    `interactive_asset_uri` / `top_background_color`.
  - In React Native this is exactly what **`react-native-story-share`** wraps.
- **Requirement on V3:** the **payload + asset are app-agnostic.** The RN app, when built, fetches
  the same `stories/{postId}.png` from R2 and feeds it to `react-native-story-share`. No re-render,
  no second pipeline. The web work is not throwaway.

> **Decision:** Web Share API now (G-funnel live), native IG Stories deferred to the RN app, payload
> designed to serve both. Do not attempt `instagram-stories://` from mobile web — it does not work.

---

## 15. Error Recovery

Reliability is layered so no single failure reaches the user.

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Pre-render (warm) throws | try/catch in write path; `Story.status=FAILED`, `renderError` set | first read lazily renders (cache-aside). User unaffected. |
| Lazy render throws | catchable via forced `arrayBuffer()` (§10 inv. 2) | return a **branded static fallback PNG** (pre-built, in `public/`) + 200 so the share still has *something* on-brand; log + Sentry; mark `FAILED` for async retry. |
| story-src variant missing | HEAD before render | regenerate variant from `posts/*` original on the fly. |
| R2 put fails | S3 error | return the freshly-rendered buffer to the user anyway (they get their card); enqueue retry to persist. Read path degrades to on-demand until persisted. |
| Emoji/font load fails | `loadStoryFonts` already returns `[]` on fail (`font.ts:60`) | degrade to system font; never crash. Emoji resolver must have the same degrade-to-nothing behavior. |
| Web Share rejected (AbortError) | `err.name==='AbortError'` (`StoryShareButton.tsx:87`) | treat as no-op (user dismissed), not an error. |
| Rate limit hit | Upstash limiter (existing) | 429 with friendly copy (`StoryShareButton.tsx:18`). |

**Key principle:** there is **always a 200 with a usable PNG** on the read path — real card if
possible, branded fallback if not. A share never produces "nothing."

**Retry of FAILED stories:** a tiny cron (`/api/cron/*`, pattern exists — `vercel.json` crons)
re-renders `status=FAILED` rows with backoff. Bounded, idempotent (keyed by `postId`).

---

## 16. Telegram Integration

- **Web file share:** the same `navigator.share({ files })` sheet includes Telegram on devices with
  the app installed → user picks a chat/channel and posts the card as a photo. **Zero extra code** —
  the multi-platform button already covers it.
- **Telegram link share (no image):** `https://t.me/share/url?url=<install_link>&text=<copy>` opens
  Telegram with a prefilled message but **cannot attach the image** (Telegram's web share takes a URL
  only). Use this only as a desktop fallback "Send link."
- **Telegram Stories:** Telegram added Stories, but there is **no public web/share-to-Story API.** The
  realistic path is share-as-photo (above). Do not promise Telegram-Story pre-fill.
- **Optional growth hook (future):** a BeActive Telegram bot that, given a `shareId`, posts the card
  to a user-chosen channel — server-side, using the cached R2 asset. Nice-to-have, not V3.

> **Decision:** Telegram is covered for free by the OS share sheet; add a `t.me/share/url` desktop
> fallback for the link. No Telegram-specific render path.

---

## 17. Security Analysis

| Concern | Control | Where |
|---------|---------|-------|
| Generate someone else's card | ownership check: `post.user.id === auth.userId` | exists (`route.tsx:59-60`); **keep** in both warm + lazy paths |
| Card for unverified post | `status === 'VERIFIED'` gate | exists (`route.tsx:61`); keep |
| Leaking internal IDs | cards keyed by `postId`/`shareId` (cuid, non-sequential); no user PII in URL | §7, §9 |
| **Public story asset = public URL** | a `stories/*` object is public-by-URL once shared (it *must* be, to render in IG). Treat the workout photo as **already public** (it is shared to friends + about to be on someone's IG Story). Do **not** put anything private (email, exact location, internal ids) in the card. | design constraint |
| Unguessable assets | `shareId` cuid + `postId` cuid in the key; not sequential | §7 |
| Rate limiting | Upstash limiter on generate/lazy endpoints (existing pattern) | `middleware/rateLimit` |
| SSRF via image fetch | renderer reads **only** R2 keys we own (never a user-supplied URL) | §8 invariant |
| CSP | `img-src` already allows `data:` + R2; story assets are R2 | `next.config.ts` headers |
| Secrets | R2 service key server-only (never `NEXT_PUBLIC_`) | CLAUDE.md §8; keep |

**One explicit acceptance:** the rendered card is **public once shared** — that is the point. The
security model is "nothing on the card is secret," not "the card URL is secret." The owner/VERIFIED
checks protect *generation*; they do not (and cannot) protect a card the user is about to post
publicly.

---

## 18. Analytics

Wire the events the v1.0 doc designed but never connected. Use the **existing append-only `Event`
table** (`schema.prisma:157`, `payload Json`, `correlationId`) — no new infra.

### Events (emit via existing event system; `correlationId = postId`)
```ts
STORY_GENERATED   { shareId, postId, template, streakCount, plantLevel, isPersonalBest,
                    workoutType, renderMs, path: 'warm'|'lazy' }
STORY_SHARE_TAPPED{ shareId, postId, surface: 'recorded'|'feed'|'profile' }
STORY_SHARED      { shareId, postId, method: 'web_share' }
STORY_DOWNLOADED  { shareId, postId, method: 'download' }
STORY_VIEW_REF    { shareId, ref: 'story' }   // landing hit carrying ?ref=story&sid=
STORY_SIGNUP_REF  { shareId }                  // signup attributed to a story
```
### Attribution loop (closes G3)
- Cards are shared as images, so the link must live in the **share text / OS share payload** and in
  the brand mark's call to action: `beactive.app/i/{shareId}` → 302 to signup with
  `?ref=story&sid={shareId}` → set a first-touch cookie → on signup, emit `STORY_SIGNUP_REF`.
- This yields a real funnel: `generated → tapped → shared → view_ref → signup_ref`, joinable by
  `shareId`. The single most important growth instrument; today it is **absent**.

### Dashboards (read-side, post-MVP)
- Share rate = `SHARED / STORY_GENERATED`; viral coefficient ≈ `signup_ref / SHARED`.

---

## 19. Cost Analysis

Assume the brief's stress point: **100,000 cards/month** (~3,300/day; peak ~10×).

| Cost driver | Today (on-demand, no cache) | V3 (snapshot + cache-aside + R2) |
|-------------|------------------------------|----------------------------------|
| Renders/month | **≫100k** (every tap, every retry, every dismiss-retry) | **≈100k** (one per workout; reads are cache hits) |
| Render runtime | ~hot-path seconds each, blocking user | off-path; user waits on a CDN GET |
| Image bytes into Satori | full-res (2–8 MB) each | downscaled (~150 KB) once |
| **CDN egress** | n/a (no cache; re-rendered) | **$0 — R2 has no egress fees** |
| Storage | 0 (nothing persisted) | ~100k × ~250 KB PNG ≈ **25 GB/mo** added; R2 ≈ $0.015/GB ≈ **~$0.38/mo** |
| Compute model | per-request serverless | Vercel **Fluid Compute** (instance reuse, less cold start, Active-CPU billing) |

**Takeaways:**
- The dominant cost is the **one-time render per card**; everything downstream (re-shares, friend
  views, multi-platform) is **free CDN**. R2's no-egress pricing is the whole reason to persist.
- Story storage is rounding-error (~cents/month at 100k).
- The expensive things the brief forbids — **GPU, video, Puppeteer, AI-per-card** — are **not used.**
  Satori is CPU-only and cheap; AI is *only* the existing classifier (one call per post, already
  there), never per card.
- **Net:** V3 is *cheaper* than today despite persisting, because it renders ~once instead of
  per-tap, and serves from free egress.

---

## 20. Scalability Analysis

The design scales by **moving work off the read path** and **changing only the trigger**, never the
renderer, as volume grows.

| Volume | Pre-render trigger | Read path | Notes |
|--------|--------------------|-----------|-------|
| 10/day | inline `after()` at verify | cache-aside lazy | trivial; warm rarely needed |
| 100/day | inline `after()` | cache-aside | same code |
| 1,000/day | inline `after()` (Fluid Compute reuse) | cache-aside | watch p95 of the warm step; still fine |
| 10,000/day | **Vercel Queue** consumer renders; verify just enqueues | cache-aside | decouples spikes; at-least-once + idempotent on `postId` |
| 100,000/mo | Queue + optional Cloudflare edge resize (§8 B) | pure CDN | reads never touch compute |

**The only architectural change across 4 orders of magnitude is the *trigger* for warming the
cache** (inline → queue). The renderer, the payload, the R2 layout, the read path, and the share
flow are **identical at every scale.** That is the "no rewrite" property the brief demands.

- **Read scale is effectively unbounded** — it is CDN GETs on immutable objects.
- **Write scale** is bounded by render throughput; a queue smooths spikes and gives durable retries
  (better than `after()`, which is best-effort and dies with the invocation).
- **DB:** `Story` is one row per post, indexed; negligible. The append-only `Event` table already
  scales for analytics.

---

## 21. Security Analysis

(See §17 — consolidated there. This heading retained for the brief's section list; the controls,
the "public once shared" acceptance, and the SSRF/ownership/rate-limit posture all live in §17.)

---

## 22. Performance Analysis

| Metric | Target | How V3 hits it |
|--------|--------|----------------|
| Tap → card (warm) | p95 ≤ 800ms | CDN GET of a ~250 KB immutable PNG |
| Tap → card (cold/lazy) | p95 ≤ 3s | single network-free render off a 150 KB source |
| Render CPU | ≤ ~600ms/card | small image in, no network stalls, local fonts/emoji |
| Verify → warm asset ready | ≤ ~5s after verify | `after()`/queue render during the celebration screen |
| Outbound calls during render | **0** | the §10 invariant (fonts/img/emoji all local) |

**The biggest perf win is removing the network from the render** (§4.1): today a slow twemoji CDN
can add seconds *or* crash; V3's render is CPU + disk only, so its latency is predictable and its
failure rate collapses. The second win is the **150 KB vs 5 MB** render input (§4.3/§8).

**Measurement:** record `renderMs` on the `Story` row and in `STORY_GENERATED.renderMs`; alert if
p95 regresses (a regression usually means a network call sneaked back into the render).

---

## 23. Future Roadmap

| Phase | Item | Gate |
|-------|------|------|
| V3 (now) | Reliable static card: snapshot payload, network-free render, R2 persist, CDN serve, Web Share, analytics+attribution | this doc |
| V3.1 | Milestone + Plant-Evolution templates (data already captured §9/§12) | template components only |
| V3.2 | `t.me/share/url` desktop fallback; multi-platform button polish | small |
| V4 | **React Native app** → true IG/Telegram/Snapchat **Stories** via `react-native-story-share`, reusing the **same R2 asset** | RN app exists |
| V5 | Animated cards (Lottie/canvas→MP4) — only after static loop is proven to convert | metrics from §18 justify it |
| V6 | BeActive Wrapped (annual, pre-generated to R2 via cron) | retention milestone |

**Sequencing principle:** do not build V5/V6 until §18's funnel proves the static card converts.
"Beautiful" is earned by data, not assumed.

---

## 24. SUBAGENT ORCHESTRATION (Sonnet execution plan)

Eight specialized Sonnet agents. The dependency DAG matters — agents 1–2 unblock everything; 3–6 are
largely parallel once the payload + schema exist; 7–8 gate the merge.

```
        ┌────────────┐
        │ A1 Auditor │ (read-only; confirms §4 against live code, freezes the contract)
        └─────┬──────┘
              ▼
      ┌───────────────┐
      │ A2 Payload &  │ (Story table + StoryPayload + module skeleton + events catalog)
      │   Schema      │
      └───┬───────┬───┘
   ┌──────┘   ┌───┴────────┐        ┌───────────────┐
   ▼          ▼            ▼        ▼               │
┌──────┐  ┌────────┐  ┌────────┐ ┌────────────┐    │
│A3    │  │A4 R2 / │  │A5 Share│ │A6 Analytics│    │
│Render│  │Image   │  │/IG/TG  │ │+ Attrib.   │    │
└──┬───┘  └───┬────┘  └───┬────┘ └─────┬──────┘    │
   └──────────┴───────────┴────────────┘           │
              ▼                                     │
        ┌───────────┐                               │
        │A7 Playwright QA│ ◄────────────────────────┘
        └─────┬─────┘
              ▼
     ┌──────────────────┐
     │A8 Prod-Readiness │ (gate: invariants, security, cost, no-network-render proof)
     └──────────────────┘
```

### Agent 1 — Architecture Auditor
- **Mission:** Verify every §4 finding against the live code; produce the frozen "current-state
  contract" so downstream agents don't re-investigate. Confirm Next/og version's `emoji` + font API
  shape (Next 16.2.6).
- **Inputs:** this doc; `app/web/app/api/stories/**`, `lib/story-card/**`, `posts/create/route.ts`,
  `lib/storage/r2.ts`, `prisma/schema.prisma`.
- **Outputs:** `docs/story-v3/audit-confirmation.md` — confirmed findings + the exact `next/og` API
  available for fonts/emoji in this version.
- **Files owned:** none (read-only) + the audit md.
- **Validation:** every §4 item marked confirmed/refuted with file:line; the emoji-render-network
  claim proven by a network trace of one current render.

### Agent 2 — Story Payload & Schema Engineer
- **Mission:** Land the `Story` model + `StoryStatus` enum (Prisma), the `StoryPayload` type, the
  `buildStoryPayload(postId)` snapshot service, and fill the empty `server/modules/stories/*`
  skeleton (controller/service/repo/schema/types) per the project's layering rule.
- **Inputs:** A1 contract; §9.
- **Outputs:** migration; `stories.types.ts`, `stories.service.ts` (`buildStoryPayload`,
  `persistStory`), `stories.repo.ts`, `stories.schema.ts`; `EVENT_CATALOG.md` entries.
- **Files owned:** `prisma/schema.prisma` (additive only), `server/modules/stories/**`.
- **Validation:** `prisma migrate` clean; snapshot freezes streak/plant at verify-time (unit test:
  changing live streak afterward does not change a persisted payload); `postId` uniqueness enforced.

### Agent 3 — Image Generation (Render) Engineer
- **Mission:** Build the **network-free** `renderStoryPng(payload)` (fonts local, image data-URI,
  **emoji local** per §10), the cache-aside read route `GET /api/stories/[postId]`, and pin
  `runtime='nodejs'` + `maxDuration`. Move `StoryCard` body into `templates/WorkoutCompleted.tsx`
  behind the dispatcher.
- **Inputs:** A1 (og API), A2 (payload), A4 (story-src variant + R2 put/exists helpers).
- **Outputs:** `server/modules/stories/stories.render.ts`; `app/api/stories/[postId]/route.ts`;
  `lib/story-card/emoji/**`; `templates/WorkoutCompleted.tsx`; dispatcher in `StoryCard.tsx`.
- **Files owned:** the render service, the read route, `lib/story-card/**` (except constants/fonts
  owned jointly).
- **Validation (hard gate):** a render performs **0 outbound network requests** (proven by trace);
  forced `arrayBuffer()` catches a deliberately-broken render as a 500, not a worker crash; cache-
  aside HIT path does no render; cold path renders+persists+returns.

### Agent 4 — R2 / Image Storage Engineer
- **Mission:** Add `putObject`, `objectExists` (HEAD) to `lib/storage/r2.ts`; build the story-src
  downscale (`sharp`, 936×620 cover) at verify-time; define the immutable cache headers; wire the
  `stories/*` + `story-src/*` key scheme.
- **Inputs:** A1; §7, §8; existing `r2.ts`.
- **Outputs:** extended `r2.ts`; `stories.image.ts` (variant generation); R2 cache-header config.
- **Files owned:** `lib/storage/r2.ts`, `server/modules/stories/stories.image.ts`.
- **Validation:** variant ≤ ~200 KB and 936×620; `stories/*` served `public, immutable, max-age=1y`;
  `objectExists` correctly drives cache-aside; no public read on `story-src/*`.

### Agent 5 — Share / Instagram / Telegram Engineer
- **Mission:** Repoint `StoryShareButton` from "generate now" to "fetch cached asset" (prefer
  `Story.assetUrl`, else lazy route); keep its state machine; add multi-platform affordance + the
  `t.me/share/url` desktop fallback; keep AbortError handling. Document the native-app path (§14) in
  code comments so the RN app reuses the asset.
- **Inputs:** A2 (assetUrl on row), A3 (read route), §13/§14/§16.
- **Outputs:** updated `components/features/StoryShareButton.tsx`; share util.
- **Files owned:** `StoryShareButton.tsx` + share util.
- **Validation:** warm tap = CDN fetch (no render); dismiss-retry is instant; download fallback works
  on desktop; no `instagram-stories://` attempt on web; Web Share file path verified on a real mobile
  user-agent via A7.

### Agent 6 — Analytics & Attribution Engineer
- **Mission:** Wire `STORY_*` events to the existing `Event` system; add the `beactive.app/i/{shareId}`
  redirect → signup `?ref=story&sid=`; first-touch cookie; `STORY_SIGNUP_REF` on signup.
- **Inputs:** A2 (`shareId`), event system, signup flow.
- **Outputs:** event emitters in the stories service + client; `app/i/[shareId]/route.ts`; signup
  attribution hook; `EVENT_CATALOG.md` updates.
- **Files owned:** attribution route, analytics emitters.
- **Validation:** full funnel emits with a joinable `shareId`; attribution cookie survives to signup;
  no PII in the redirect.

### Agent 7 — Playwright QA Engineer
- **Mission:** End-to-end + visual proof. Render parity (static vs `StoryCardLive`), safe-area
  compliance (content inside `STORY_SAFE_BAND`), reduced-motion respect, and the share happy/cold/
  fallback paths. Reuse the dev-only preview route pattern.
- **Inputs:** A3–A6 outputs; `lib/story-card/constants.ts` safe-area.
- **Outputs:** `tests/e2e/story-*.spec.ts`; visual baselines; a throwaway harness page (deleted after).
- **Files owned:** story E2E specs.
- **Validation:** card content never enters the unsafe band at 1080×1920; warm/cold/fallback all
  yield a 200 PNG; zero-network-render assertion automated; no horizontal-scroll / clipping
  regressions in the preview.

### Agent 8 — Production-Readiness Reviewer
- **Mission:** Gate the merge. Verify the four render invariants (§10), security checks (§17), cost
  posture (§19 — no GPU/video/Puppeteer/AI-per-card), error-recovery layering (§15), and that the
  "no rewrite to scale" property holds (trigger-only change, §20).
- **Inputs:** everything.
- **Outputs:** `docs/story-v3/readiness-report.md` — PASS/FAIL per invariant with evidence.
- **Files owned:** the readiness report; merge sign-off.
- **Validation:** all four render invariants proven; ownership/VERIFIED gates present on both render
  paths; fallback PNG path returns 200; `Story` persistence idempotent on `postId`.

**Coordination rules:** A1→A2 are sequential. A3/A4 are tightly coupled (A3 consumes A4's `putObject`
/ variant) — they may run in one worktree or with A4 landing helpers first. A5/A6 depend on A2's row
+ A3's route but are otherwise independent. A7 runs against the integrated branch; A8 is the final
gate. Every agent obeys the existing **Fact-Forcing Gate** (present importers + affected functions +
data structure + verbatim instruction before edits) and runs `lint` + `type-check` before handoff.

---

## 25. RECOMMENDED PRODUCTION ARCHITECTURE

> *"If BeActive had 100,000 users generating story cards per month, how would you implement this
> today?"* — not the prettiest, the most likely to succeed.

**Build this:**

1. **Snapshot the payload at verify-time.** On `WORKOUT_VERIFIED`, freeze streak/plant/type/identity
   into an immutable `StoryPayload` and persist a `Story` row (`payload Json`, `status=PENDING_RENDER`,
   `postId @unique`). *This single decision* makes the card a pure function of stable inputs — the
   precondition for everything cheap and reliable. (Fixes §4.5; enables §11.)

2. **Render once, off the hot path, with zero network in the renderer.** One
   `renderStoryPng(payload)`: local fonts (exists), **local emoji** (the critical missing fix, §4.1),
   and a **pre-downscaled 150 KB** story-source image (§8). Pin `runtime='nodejs'`, `maxDuration=60`,
   and keep the forced-`arrayBuffer()` catch. (Fixes §4.1–§4.3.)

3. **Persist the PNG to Cloudflare R2 and serve it immutable from the CDN.** Key
   `stories/{postId}/{shareVersion}.png`, `Cache-Control: public, max-age=31536000, immutable`. R2's
   **no-egress-fee** pricing makes every re-share, friend-view, and multi-platform post **free**.
   (Fixes §4.4.)

4. **Cache-aside read path is the durable source of truth; pre-generation is a cache-warm
   optimization.** `GET /api/stories/{postId}` streams the R2 object if present, else renders-once-
   and-persists. Pre-render in `after()` at small scale, in a **Vercel Queue** at large scale — and
   *that trigger swap is the only thing that changes from 10 to 100,000 users.* (Realizes §20's
   no-rewrite property.)

5. **The user-facing share path is a CDN GET, not a render.** `StoryShareButton` fetches the cached
   asset and hands it to `navigator.share({ files })`. Instant, and it basically cannot fail.
   (Realizes §13.)

6. **Instrument the funnel and close attribution.** Wire `STORY_*` events to the existing append-only
   `Event` table and ship `beactive.app/i/{shareId}` → signup `?ref=story`. Without this the growth
   engine is unmeasured. (Fixes §4.7.)

7. **Be honest about platform limits.** Web Share API now (the real funnel); native IG/Telegram
   **Stories** later via the RN app + `react-native-story-share`, reusing the *same* R2 asset. Don't
   chase `instagram-stories://` from mobile web. (§14, §16.)

**What we deliberately do NOT build:** GPU rendering, video/MP4, Puppeteer/headless Chrome, per-card
AI, or a second native pipeline. None are needed; all are expensive or fragile. Satori (CPU-only) +
R2 (free egress) + cache-aside is the boring, durable, cheap answer.

**Why this is the production answer:** it renders **~once per card instead of once per tap**, makes
the user-facing path a **CDN hit that cannot fail**, costs **single-digit dollars/month at 100k**
(storage is cents, egress is free), and **scales four orders of magnitude by changing only the
pre-render trigger.** It fixes every concrete failure in §4 without touching the visual system the
team already got right. It works first. It is beautiful second.

---

*End of blueprint. Implementation proceeds via the §24 agent plan; §25 is the north star.*
