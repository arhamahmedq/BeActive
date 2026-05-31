# Slice 3.5 — Upload UX Feedback Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent post-upload redirect with a real verification feedback loop: uploading → verifying (shimmer over user's photo) → recorded / not_a_workout / still_checking.

**Architecture:** A new `usePostStatus` hook wraps TanStack Query to poll `GET /api/posts/:id` every 1.5s until VERIFIED or REJECTED. The upload page's `Stage` state machine gains four stages; two `useEffect` hooks drive transitions from poll results and a 30s timeout. Two CSS animations (scan shimmer + checkmark draw) are added to globals.css using Tailwind v4's `@utility` directive. Zero backend changes.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Tailwind CSS v4, TypeScript strict

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/web/hooks/usePostStatus.ts` | **Create** | Poll `GET /api/posts/:id`; expose status + workoutType; stop polling on terminal state |
| `app/web/app/globals.css` | **Modify** | Add `@keyframes scan` + `@keyframes draw-check` + two `@utility` mappings |
| `app/web/app/(main)/upload/page.tsx` | **Modify** | Extend Stage type; add postId/workoutType state; fix premature redirect; add useEffects; add four new stage renders; remove `done` stage |

---

## Task 1: Create `usePostStatus` hook

**Files:**
- Create: `app/web/hooks/usePostStatus.ts`

- [ ] **Step 1: Create the file with complete implementation**

```typescript
// app/web/hooks/usePostStatus.ts
'use client'
import { useQuery } from '@tanstack/react-query'

export interface PostStatusResult {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  workoutType: string | undefined
  confidence: number | undefined
}

export function usePostStatus(postId: string | null, enabled: boolean) {
  return useQuery<PostStatusResult>({
    queryKey: ['post-status', postId],
    queryFn: async (): Promise<PostStatusResult> => {
      const res = await fetch(`/api/posts/${postId}`)
      if (!res.ok) throw new Error('Failed to fetch post status')
      const { post } = (await res.json()) as {
        post: {
          status: string
          workout?: { type?: string; aiConfidence?: number } | null
        }
      }
      return {
        status: post.status as PostStatusResult['status'],
        workoutType: post.workout?.type ?? undefined,
        confidence: post.workout?.aiConfidence ?? undefined,
      }
    },
    enabled: enabled && postId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'VERIFIED' || s === 'REJECTED' ? false : 1500
    },
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  })
}
```

- [ ] **Step 2: Type-check the hook compiles cleanly**

```bash
cd app/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors mentioning `usePostStatus`.

- [ ] **Step 3: Commit**

```bash
git add app/web/hooks/usePostStatus.ts
git commit -m "feat: add usePostStatus polling hook for AI verification status"
```

---

## Task 2: Add animation CSS to globals.css

**Files:**
- Modify: `app/web/app/globals.css`

- [ ] **Step 1: Add keyframes and utilities**

The file currently contains only `@import "tailwindcss";`. Append the following:

```css
@import "tailwindcss";

@keyframes scan {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
}

@keyframes draw-check {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@utility animate-scan {
  animation: scan 1.5s ease-in-out infinite;
}

@utility animate-draw-check {
  animation: draw-check 0.4s ease-out forwards;
}
```

- [ ] **Step 2: Verify dev server compiles without error**

```bash
cd app/web && npm run dev 2>&1 | head -20
```

Expected: no CSS compilation errors. The server starts on port 3000.

Kill with Ctrl+C after confirming.

- [ ] **Step 3: Commit**

```bash
git add app/web/app/globals.css
git commit -m "feat: add scan shimmer and draw-check animations for upload UX"
```

---

## Task 3: Refactor upload page state machine

**Files:**
- Modify: `app/web/app/(main)/upload/page.tsx`

This task only touches types, state declarations, and the two handler functions. No new UI yet.

- [ ] **Step 1: Replace the Stage type (line 76)**

Find:
```typescript
type Stage = 'select' | 'preview' | 'uploading' | 'done'
```

Replace with:
```typescript
type Stage = 'select' | 'preview' | 'uploading' | 'verifying' | 'recorded' | 'not_a_workout' | 'still_checking'
```

- [ ] **Step 2: Add `postId` and `workoutType` state (after line 93, after `const [isRetrying, setIsRetrying] = useState(false)`)**

```typescript
const [postId, setPostId] = useState<string | null>(null)
const [workoutType, setWorkoutType] = useState<string | undefined>(undefined)
```

- [ ] **Step 3: Fix `handlePost` — remove premature redirect, capture postId**

Find this block near the end of the `try` in `handlePost` (currently lines 166–169):
```typescript
      // 5. Revoke preview URL and redirect
      URL.revokeObjectURL(selected.previewUrl)
      setStage('done')
      router.push('/feed')
```

Replace with:
```typescript
      // 5. Capture post ID and enter verification stage
      const { post } = (await createRes.json()) as { post: { id: string } }
      setPostId(post.id)
      setStage('verifying')
      // Preview URL intentionally kept alive — needed for verifying UI
```

- [ ] **Step 4: Update `resetToSelect` to also clear postId and workoutType**

Find the `resetToSelect` callback:
```typescript
  const resetToSelect = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected(null)
    setCaption('')
    setError(null)
    setUploadProgress(0)
    setStage('select')
  }, [selected])
```

Replace with:
```typescript
  const resetToSelect = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected(null)
    setCaption('')
    setError(null)
    setUploadProgress(0)
    setPostId(null)
    setWorkoutType(undefined)
    setStage('select')
  }, [selected])
```

- [ ] **Step 5: Add `handleContinue` callback (after `resetToSelect`)**

```typescript
  const handleContinue = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    router.push('/feed')
  }, [selected, router])
```

- [ ] **Step 6: Type-check compiles cleanly**

```bash
cd app/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors. (`router` is already imported at the top of the file.)

- [ ] **Step 7: Commit**

```bash
git add app/web/app/(main)/upload/page.tsx
git commit -m "refactor: extend upload page Stage machine, fix premature redirect"
```

---

## Task 4: Wire polling into the upload page

**Files:**
- Modify: `app/web/app/(main)/upload/page.tsx`

- [ ] **Step 1: Add the import for `usePostStatus` and `useEffect` at the top of the file**

The file currently starts with:
```typescript
'use client'
import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
```

Replace with:
```typescript
'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { usePostStatus } from '@/hooks/usePostStatus'
```

- [ ] **Step 2: Add hook call (immediately after the state declarations block, before `handleFileChosen`)**

After the `workoutType` state line, add:

```typescript
  const { data: postStatus } = usePostStatus(postId, stage === 'verifying')
```

- [ ] **Step 3: Add the two transition effects (after the hook call)**

```typescript
  // Drive stage from poll result
  useEffect(() => {
    if (stage !== 'verifying' || !postStatus) return
    if (postStatus.status === 'VERIFIED') {
      setWorkoutType(postStatus.workoutType)
      setStage('recorded')
    } else if (postStatus.status === 'REJECTED') {
      setStage('not_a_workout')
    }
  }, [postStatus, stage])

  // 30-second timeout → still_checking
  useEffect(() => {
    if (stage !== 'verifying') return
    const t = setTimeout(() => setStage('still_checking'), 30_000)
    return () => clearTimeout(t)
  }, [stage])
```

- [ ] **Step 4: Type-check**

```bash
cd app/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/web/app/(main)/upload/page.tsx
git commit -m "feat: wire usePostStatus polling and stage transition effects"
```

---

## Task 5: Implement `verifying` UI

**Files:**
- Modify: `app/web/app/(main)/upload/page.tsx`

- [ ] **Step 1: Add the verifying render block**

The render section starts at the `if (stage === 'uploading')` block. Add the `verifying` block immediately after the `uploading` block (before the `done` block if it still exists, or wherever `uploading` block ends):

```typescript
  if (stage === 'verifying' && selected) {
    return (
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="relative overflow-hidden rounded-2xl bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="Workout photo"
            className="w-full aspect-square object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-scan" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold">Checking your workout</p>
          <p className="text-sm text-gray-400">This usually takes a few seconds</p>
        </div>
      </div>
    )
  }
```

- [ ] **Step 2: Type-check**

```bash
cd app/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/web/app/(main)/upload/page.tsx
git commit -m "feat: add verifying stage UI with shimmer animation"
```

---

## Task 6: Implement result UIs and remove `done` stage

**Files:**
- Modify: `app/web/app/(main)/upload/page.tsx`

- [ ] **Step 1: Add `recorded` UI (after the `verifying` block)**

```typescript
  if (stage === 'recorded') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-600"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Workout verified"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="100"
              strokeDashoffset="0"
              className="animate-draw-check"
            />
          </svg>
        </div>
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">Workout recorded</p>
          {workoutType && (
            <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-sm font-medium text-gray-700">
              {workoutType.charAt(0) + workoutType.slice(1).toLowerCase()}
            </span>
          )}
        </div>
        <Button onClick={handleContinue} className="w-full max-w-xs">
          Continue
        </Button>
      </div>
    )
  }
```

- [ ] **Step 2: Add `not_a_workout` UI (after `recorded` block)**

```typescript
  if (stage === 'not_a_workout') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Not a workout"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path
              d="M15 9l-6 6M9 9l6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">This doesn&apos;t look like a workout</p>
          <p className="text-sm text-gray-400 max-w-xs">
            Try a photo that shows you being active.
          </p>
        </div>
        <Button onClick={resetToSelect} className="w-full max-w-xs">
          Try a different photo
        </Button>
      </div>
    )
  }
```

- [ ] **Step 3: Add `still_checking` UI (after `not_a_workout` block)**

```typescript
  if (stage === 'still_checking') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-yellow-50 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-yellow-500"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Still checking"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 7v5l3 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">Still checking your workout</p>
          <p className="text-sm text-gray-400 max-w-xs">
            We&apos;ll update your feed when it&apos;s ready.
          </p>
        </div>
        <Button onClick={handleContinue} className="w-full max-w-xs">
          Continue
        </Button>
      </div>
    )
  }
```

- [ ] **Step 4: Remove the `done` stage render block**

Find and delete this entire block:
```typescript
  if (stage === 'done') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-4xl">✓</div>
        <p className="text-lg font-semibold">Workout submitted!</p>
        <p className="text-sm text-gray-500">AI is verifying your photo…</p>
      </div>
    )
  }
```

- [ ] **Step 5: Type-check**

```bash
cd app/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/web/app/(main)/upload/page.tsx
git commit -m "feat: add recorded, not_a_workout, still_checking result UIs; remove done stage"
```

---

## Task 7: Full verification + QA steps

- [ ] **Step 1: Run the existing unit test suite**

```bash
cd /Users/arhamahmedfiroz/Documents/Projects/BeActive && npm run test 2>&1 | tail -20
```

Expected: all tests pass (105 tests from Slice 3 + prior slices). No regressions.

- [ ] **Step 2: Run lint**

```bash
cd app/web && npm run lint 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 3: Final type-check across entire project**

```bash
cd app/web && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 4: Commit any lint fixes (if needed)**

```bash
git add -p && git commit -m "fix: lint corrections for Slice 3.5 upload UX"
```

---

## Manual QA Steps (for founder to run after implementation)

Start the dev server:
```bash
cd app/web && npm run dev
```

Open `http://localhost:3000` and log in.

### QA Flow 1 — Workout photo (happy path)

1. Navigate to `/upload`
2. Select a photo that clearly shows exercise (gym, running, etc.)
3. Tap **"Post workout"**
4. **Expected:** Progress bar appears — "Uploading your photo"
5. **Expected:** Progress bar fills to 100% and transitions seamlessly to the verifying screen
6. **Expected:** Verifying screen shows YOUR photo with a left-to-right shimmer passing over it
7. **Expected:** Copy reads "Checking your workout" / "This usually takes a few seconds"
8. **Expected:** Within ~3–5s, shimmer disappears and a green circle with an animated checkmark draws in
9. **Expected:** Copy reads "Workout recorded" with a workout type pill (e.g. "Running" or "Gym")
10. **Expected:** "Continue" button navigates to `/feed`
11. Confirm no console errors in browser DevTools

### QA Flow 2 — Non-workout photo (rejection path)

1. Navigate to `/upload`
2. Select a photo of food, a landscape, or anything that is clearly not exercise
3. Tap **"Post workout"**
4. **Expected:** Same upload + verifying states as Flow 1
5. **Expected:** Within ~3–5s, screen shows a gray circle with an X icon
6. **Expected:** Copy reads "This doesn't look like a workout" / "Try a photo that shows you being active."
7. **Expected:** "Try a different photo" button resets the entire flow back to the capture screen
8. **Expected:** Caption is cleared; no stale state

### QA Flow 3 — Error during upload

1. Disconnect from the internet (or use DevTools → Network → Offline)
2. Attempt an upload
3. **Expected:** Error message appears on the preview screen ("Something went wrong. Please try again.")
4. **Expected:** Button changes to "Retry upload"
5. Reconnect and retry
6. **Expected:** Upload completes normally

### QA Flow 4 — Navigation regression check

1. Go to `/login` and confirm auth still works
2. Go to `/feed` directly and confirm it still loads (even if it shows "Feed coming in Slice 5")
3. Confirm no broken imports or white-screen errors on any page

### QA Flow 5 — Timeout path (if you want to test it)

1. In `app/web/app/(main)/upload/page.tsx`, temporarily change the timeout from `30_000` to `5_000`
2. Upload a photo
3. **Expected:** After 5 seconds of the verifying state, the "Still checking" UI appears with the clock icon
4. "Continue" navigates to `/feed`
5. Revert the timeout back to `30_000`
