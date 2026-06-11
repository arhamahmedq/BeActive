# Story Sharing — Phase 1 Execution Report

> **Scope:** Phase 1 only, per user direction — *"Fix the §4.1/§4.2 critical bugs
> directly: vendor emoji locally (zero-network render), pin runtime/maxDuration,
> downscale the render image. No DB migration, no new tables."* §4.3 (image
> downscale) was descoped at the start of this phase (see §3 below).
>
> Reference: `docs/Story Sharing Architecture V3.md` §4.1, §4.2, §4.3.

---

## 1. §4.1 — Eliminate the twemoji CDN fetch (zero-network render)

### Root cause
`next/og`'s `ImageResponse` has no bundled emoji glyphs. Any emoji character in
the render tree is resolved by Satori fetching an SVG from a CDN (twemoji by
default) **during the lazy render**, which runs *after* the route handler
returns. A slow or failed CDN fetch crashes the worker with an empty reply —
uncatchable by any `try/catch` in the route. This was the dominant cause of the
"intermittent failures" reported in production.

### Fix
Created `app/web/lib/story-card/icons.tsx` — every glyph the story card needs
is now drawn as plain local SVG (path/circle/rect/polygon/ellipse/line, solid
fills/strokes only — no gradients/filters/masks, which Satori doesn't support).
Zero network calls, zero external font/icon dependency.

| Old emoji | New component |
|---|---|
| ✅ | `VerifiedBadge` |
| 🏋️ 🏃 🚴 🏊 🌄 ⚽ 💪 (workout type) | `WorkoutIcon` (dispatches on `workoutType`) |
| 🌱 🌿 🪴 🌲 🌳 🎄 🌸 (plant tiers) | `PlantGlyph` (dispatches on `plant.level`) |
| ❤️ / ✈️ (dev-only IG-chrome overlay) | `HeartIcon` / `SendIcon` |

Updated to consume the new components / data shapes:
- `lib/story-card/StoryCard.tsx` (production Satori template)
- `lib/story-card/StoryCardLive.tsx` (live framer-motion twin — kept in sync
  per the "two renderers, same composition" pattern)
- `lib/story-card/StoryFrame.tsx` (dev-only `IGChromeOverlay`)
- `app/api/stories/generate/route.tsx` and `app/api/stories/preview/route.tsx`
  (`cardData` now passes `workoutType` + a `plant: {level, color, bgColor,
  borderColor}` snapshot instead of `workoutIcon`/`plantEmoji` strings)
- `app/story-preview-live/page.tsx` (dev preview page, same prop shape change)
- `lib/story-card/constants.ts` — removed the now-dead `WORKOUT_ICONS` map and
  the `emoji` field from every `PLANT_LEVELS` entry (neither was read by any
  consumer after the above changes — confirmed via repo-wide grep). The
  story-card module now contains **zero emoji literals** in its render path.

### A new gotcha discovered along the way
Satori requires every `<svg>`'s children to be **literal host elements**
(`<circle>`, `<path>`, `<rect>`, etc.) — not a custom component returning a
`<>...</>` Fragment. An `<svg>` whose only child is such a component silently
renders **nothing** (no error, no crash — just missing artwork). The first
draft of `WorkoutIcon`/`PlantGlyph` hit this (dispatch happened *inside* the
`<svg>`); the fix was to make every icon variant its own top-level component
returning ONE complete `<svg>...</svg>`, with the dispatch (`switch`)
happening *before* reaching any `<svg>`. This is documented in
`icons.tsx`'s file header and in the `story-card-render` memory for future
Satori/SVG work.

### Verification
Rendered `/api/stories/preview` (dev-only) across:
- All 7 workout types: GYM, RUNNING, CYCLING, SWIMMING, OUTDOOR, SPORTS, OTHER
- All 7 plant tiers: Dormant Seed → Legendary Bloom (`?plantdays=0,1,30,100,200,...`)
- Personal-best ("NEW") state (`?pb=1`)

All render correctly with the new local SVG icons — confirmed visually via
`sips`-cropped PNG inspection. No emoji remain anywhere in the render tree
(confirmed via grep for emoji-range codepoints and for `twemoji`/`.emoji`
references across `lib/story-card/`, `app/api/stories/`, and
`app/story-preview-live/`).

---

## 2. §4.2 — Pin `runtime` and `maxDuration`

### Root cause
`/api/stories/generate/route.tsx` had no explicit `runtime`/`maxDuration`
export, so it defaulted to Vercel Hobby's 10s function timeout. `ImageResponse`'s
lazy Satori render (image fetch + font embed + layout) can exceed 10s,
especially under cold start — crashing the worker mid-stream.

### Fix
Added to `app/web/app/api/stories/generate/route.tsx`:

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
```

This pins the route to the Node runtime with the Pro-tier 60s ceiling. Scoped
to the production `generate` route only, per the blueprint — the dev-only
`preview` route (404s in production) was left as-is.

---

## 3. §4.3 — Image downscale (DEFERRED)

`sharp` is not present in `node_modules` and would be a new dependency.
Per the agreed Phase 1 scope, this is explicitly **out of scope** — no new
dependencies were added. The full-size image fetch/encode in
`generate/route.tsx` (`toDataUri`) is unchanged. Revisit as a separate phase
if production payload size or render time becomes a problem after §4.1/§4.2
land.

---

## 4. Net result

- Zero emoji / zero twemoji-CDN dependency anywhere in the story-card render
  path (production and dev).
- Production `generate` route has a 60s budget on the Node runtime instead of
  the 10s Hobby default.
- No DB migrations, no new tables, no new npm dependencies.
- `tsc --noEmit` and `eslint` clean; `/api/stories/preview` returns 200 with a
  valid 1080×1920 PNG across all workout types, all plant tiers, and the
  personal-best state.

This directly addresses the two confirmed root causes of "intermittent
failures": the uncatchable mid-stream CDN fetch (§4.1) and the too-short
function timeout (§4.2).
