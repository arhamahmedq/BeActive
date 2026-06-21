# Checklist — Security

> Reusable checks for the Security reviewer. Source of truth: `docs/security.md`, `docs/AI_BOUNDARY.md`, `CLAUDE.md §6`.
> Severity rubric lives in `docs/REVIEW_PROCESS.md`. Mark each finding **Blocker / Major / Minor**.

## AI Boundary (NON-NEGOTIABLE — any violation is a Blocker)
- [ ] AI code does **not** write to the DB, trigger state transitions, or read user/streak/friend data.
- [ ] Classifier I/O is only `{ isWorkout, type, confidence, processingTimeMs, modelVersion }`.
- [ ] Streak increments are decided by the rule engine + state machine, never by AI output directly.
- [ ] Operational timeouts (e.g. `classification_unavailable`) are not framed as AI decisions.

## Input validation & trust boundaries
- [ ] Every endpoint validates its body/query with a Zod schema **server-side** (not just client).
- [ ] File uploads validate metadata server-side — never trust client MIME/extension; size cap enforced.
- [ ] EXIF stripped before any image is served; unstripped images are never persisted/served.
- [ ] No raw SQL without a `data_model.md` check; cursor pagination only (no offset).

## Auth & session
- [ ] Auth middleware guards **every** mutation endpoint.
- [ ] Sessions use HTTP-only cookies (`SameSite=Lax`) — never `localStorage`.
- [ ] No secrets hardcoded; `SUPABASE_SERVICE_KEY` / AI keys are never `NEXT_PUBLIC_*`.
- [ ] Friends-only resources return **404 not 403** (no existence leak — `assertCanViewPost`).

## Webhook / cron / queue surfaces
- [ ] `/api/queue/classify` verifies the QStash signature; `/api/cron/*` checks the `CRON_SECRET` bearer.
- [ ] Cron endpoints reachable over `https://` only (Vercel 308s `http://` at the edge).

## Data & events
- [ ] Events table writes are append-only — no update/delete of rows.
- [ ] Every state change emits an event registered in `EVENT_CATALOG.md`.
- [ ] No cross-module repo imports; controllers contain no business logic.

## Response hygiene
- [ ] No internal IDs, stack traces, or Prisma errors leak in API responses (use `AppError` codes).
- [ ] Error shape matches `{ error: { code, message, details } }`.

## Secrets in diff
- [ ] No `.env*` values, keys, or tokens committed in the change.
