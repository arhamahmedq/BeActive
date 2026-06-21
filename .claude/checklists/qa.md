# Checklist — QA

> Reusable checks for the QA reviewer. Source of truth: `docs/TESTING_STRATEGY.md`, `docs/FAILURE_MODES.md`.
> Severity rubric in `docs/REVIEW_PROCESS.md`. Mark each finding **Blocker / Major / Minor**.

## Test presence & taxonomy
- [ ] New/changed logic in `server/**` or `shared/**` has a unit test in `tests/unit/**`.
- [ ] Cross-module wiring (events → rules → state machine) covered in `tests/integration/**`.
- [ ] User-facing flow changes considered for `tests/e2e/**` (Playwright).
- [ ] Tests assert **behavior and edge cases**, not just the happy path (see FAILURE_MODES.md).

## Green & honest
- [ ] `npm test` passes locally before commit.
- [ ] No `.only`, no `.skip`, no commented-out assertions left behind.
- [ ] Coverage on changed files is not lower than before (no net-negative coverage).

## Domain smoke gates (run the matching script when its domain is touched)
- [ ] Streaks → `node --env-file=app/web/.env.local qa-streak.mjs` (T1–T7) **and** `npm run validate:parity` if the ledger changed.
- [ ] Friends → `qa-friends.mjs` (25-check smoke).
- [ ] Likes/comments/avatars → `qa-interactions.mjs` (22-check smoke).
- [ ] Day-increment / timezone logic → `qa-day-increment.mjs` + `npm run audit:timezones` (Invalid count = 0).

## Edge cases that historically break (FAILURE_MODES.md)
- [ ] Idempotency: duplicate same-day completion → P2002 handled, not a 500.
- [ ] AI PENDING / poison-post path (`classificationAttempts`, giveup threshold) still covered.
- [ ] Auth/session edge: corrupted cookie → 401 → redirect, not a crash.
- [ ] Upload edge: expired R2 URL, oversize file, bad MIME → clear error, no orphan.

## Determinism
- [ ] No reliance on wall-clock `Date.now()` without injectable `now` (streak/feed tests must be deterministic).
- [ ] No network calls in unit tests (AI/Supabase/R2 mocked).
