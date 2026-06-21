# Checklist — Mobile Performance

> Reusable checks for the Mobile Performance reviewer. BeActive is a mobile-web, image-heavy social app.
> Source of truth: `CLAUDE.md §7` (feed ranking, AI async), `docs/architecture.md`, Vercel limits.
> Severity rubric in `docs/REVIEW_PROCESS.md`. Mark each finding **Blocker / Major / Minor**.

## Serverless & async boundaries
- [ ] No synchronous work that can exceed the Vercel timeout (10s free / 60s pro).
- [ ] AI classification stays async (QStash queue → `/api/queue/classify`, or `after()` fallback) — never inline in the request.
- [ ] Long work is offloaded; the request returns fast.

## Database / data access
- [ ] Cursor-based pagination only (no offset); feed honors `FEED_CANDIDATE_CAP=500`, `FEED_WINDOW_DAYS=30`.
- [ ] No N+1 queries — relations fetched with `include`/`select`, not per-row loops.
- [ ] Indexed columns used for filters/sorts (check `data_model.md`); no full-table scans on hot paths.
- [ ] Only needed columns selected on list endpoints (no over-fetch of large fields).

## Images (the heaviest payload)
- [ ] Images served at display size from R2; not full-res into a thumbnail grid.
- [ ] `next/image` (or explicit dimensions) used to prevent layout shift; lazy-loaded below the fold.
- [ ] EXIF strip + resize happens once (upload), not per-render.

## Bundle & client cost
- [ ] No new dependency added where a few lines / native platform feature would do (Ponytail ladder).
- [ ] New client deps justified by bundle delta; heavy libs are dynamically imported.
- [ ] `framer-motion` animations are GPU-friendly (transform/opacity), not animating layout properties.
- [ ] No large data fetched then filtered on the client.

## Perceived performance (mobile, mid-tier device)
- [ ] Above-the-fold content (feed first card, streak ring) renders without waiting on the full payload.
- [ ] Optimistic UI or skeletons on the interaction critical path (like, comment, upload).
- [ ] No main-thread-blocking synchronous loops on render.
