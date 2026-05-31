# Slice 3.5 — Upload UX Feedback Layer

**Date:** 2026-05-31
**Status:** Approved — ready for implementation
**Scope:** Frontend-only. No backend, schema, event system, or API changes.

---

## Problem

The AI classifier is correct. The database reflects the right outcome. But after upload, the user is silently redirected to an empty feed and sees nothing. Verified workouts, rejected non-workouts, and AI failures all produce the same user experience: nothing. This kills first-session activation.

Root cause: `upload/page.tsx` calls `router.push('/feed')` the instant the post is *created* (status `PENDING`), before the classifier has run. The result is computed server-side but never shown to the user.

---

## Design Constraints

- AI must be invisible. This is a fitness app, not an AI product.
- No AI jargon: no "vision model," no "confidence score," no terminal logs.
- Visual tone: calm, premium, minimal — Linear/Raycast/Apple, not ChatGPT.
- Two files change. Everything else is untouched.
- Backend, classifier, Prisma schema, event system: frozen.

---

## State Machine

Extends the existing `Stage` type in `upload/page.tsx`.

```
select → preview → uploading → verifying → recorded
                                          → not_a_workout
                                          → still_checking
```

Removed: `'done'` — the stage that triggered the premature redirect.

### Transitions

| From | To | Trigger |
|------|----|---------|
| `uploading` | `verifying` | POST /posts/create returns 201; `postId` captured |
| `verifying` | `recorded` | Poll returns `status === 'VERIFIED'` |
| `verifying` | `not_a_workout` | Poll returns `status === 'REJECTED'` |
| `verifying` | `still_checking` | 30s elapsed, still `PENDING` |
| `recorded` | feed | User taps "Continue" |
| `not_a_workout` | `select` | User taps "Try a different photo" (existing `resetToSelect()`) |
| `still_checking` | feed | User taps "Continue" |

---

## Data Flow

### `usePostStatus` hook (new file)

`app/web/hooks/usePostStatus.ts`

- Wraps `useQuery` from TanStack Query (already globally provided)
- Fetches `GET /api/posts/:id` — existing endpoint, no changes needed
- `refetchInterval`: 1500ms while status is `PENDING`; `false` when `VERIFIED` or `REJECTED`
- `enabled`: only when `postId !== null` AND `stage === 'verifying'`
- `staleTime: 0` — always re-fetch

Returns: `{ status, workoutType, confidence }` or `undefined` while loading.

### Stage transitions (upload page)

Two `useEffect` hooks in the page component:

**Effect 1 — poll result drives stage:**
```
when: stage === 'verifying' and postStatus arrives
  if VERIFIED → setStage('recorded')
  if REJECTED → setStage('not_a_workout')
```

**Effect 2 — timeout:**
```
when: stage === 'verifying'
  setTimeout 30s → setStage('still_checking')
  cleanup on unmount or stage change
```

### Fix for premature redirect

In `handlePost`, replace:
```typescript
setStage('done')
router.push('/feed')
```
With:
```typescript
const { post } = await createRes.json()
setPostId(post.id)
setStage('verifying')
```

One line removed, two lines added.

---

## UI Specification

### Stage: `verifying`

The user's **own photo** is shown, full-width, with a soft animated horizontal shimmer passing over it (CSS keyframe, `animate-pulse` or custom `scan` keyframe). No spinners. No logs.

```
[user's photo with shimmer overlay]

Checking your workout
This usually takes a few seconds
```

Typography: headline 18px semibold, subtext 14px gray-500. No AI framing.

### Stage: `recorded`

Animated checkmark (SVG stroke-dashoffset draw-in, ~400ms, ease-out). Calm green, not alarm-green (`text-green-600`, `bg-green-50`).

```
  ✓  (draws in)

Workout recorded

  Running          ← pill: workout type, title-cased, from postStatus.workoutType

[Continue]         → router.push('/feed')
```

The type pill only renders when `workoutType` is present. If absent, the heading stands alone — no fallback label, no broken UI.

### Stage: `not_a_workout`

Calm, not alarming. No red error boxes. Honest and actionable.

```
This doesn't look like a workout.

Try a photo that shows you being active.

[Try a different photo]   → resetToSelect()
```

Typography: 18px semibold headline, 14px gray-500 body. No icon required — copy carries the message.

### Stage: `still_checking`

All PENDING-after-timeout paths land here: ambiguous confidence, AI failure, slow inference.

```
Still checking your workout.

We'll update your feed when it's ready.

[Continue]   → router.push('/feed')
```

The post is saved and will resolve server-side. User is unblocked with accurate expectation-setting.

---

## Edge Cases

| Scenario | Resolution |
|----------|-----------|
| AI permanently fails (exhausted retries) | Post stays `PENDING` → 30s timeout → `still_checking` |
| AMBIGUOUS confidence (0.50–0.69) | Post stays `PENDING` → 30s timeout → `still_checking` |
| Poll network error | TanStack retries once; on failure, `still_checking` stage still fires at 30s timeout |
| User navigates away mid-verify | `enabled: false` shuts down query; timeout `clearTimeout` runs on unmount |
| `workoutType` missing on `recorded` | Type pill not rendered; heading stands alone |

---

## Files Changed

| File | Change |
|------|--------|
| `app/web/hooks/usePostStatus.ts` | **New** — ~30 lines. Polling hook. |
| `app/web/app/(main)/upload/page.tsx` | **Modified** — remove premature redirect; add `postId` state; extend `Stage`; add verifying/result UI; add two `useEffect`s for transition and timeout. |

**All other files: unchanged.**

---

## Out of Scope

- Feed page content (Slice 5)
- Streak engine (Slice 4)
- Notifications
- Stories
- Any new API routes or backend logic
