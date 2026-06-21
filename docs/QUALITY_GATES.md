# QUALITY_GATES.md — BeActive Gate Matrix

> The checkpoints a change passes from edit to merge. Each gate is a place where bad code is stopped. Local gates mirror CI so red never reaches GitHub.

## The matrix

| Gate | Where it runs | Enforces | Blocking | Status |
|---|---|---|---|---|
| **G0 — Edit** | PostToolUse hook (`.claude/hooks/eslint-on-edit.sh`) | ESLint on every edited `app/web` file | exit 2 → fix before continuing | **Active** |
| **G1 — Typecheck** | local + CI | `npm run type-check` (web + server, both tsconfigs) | red → fix | **Active** (CI) |
| **G2 — Tests** | local + CI | `npm test` (Vitest unit + integration) green | red → fix | **Active** (CI) |
| **G3 — Review** | `.claude/workflows/review-loop.md` | reviewer blockers = 0 (the 5 reviewers) | any Blocker → fix + re-run | **Active** |
| **G4 — CI** | `.github/workflows/ci.yml` | lint · typecheck · build · tests on push/PR to `master` | required check → blocks merge | **Active** |
| **G5 — E2E** | `tests/e2e` (Playwright) | critical user flows | nightly first, then required | **Planned** (Phase 4) |

## Verified baseline (2026-06-21)

Measured at system install, so the gates don't claim a false green:

| Check | Result |
|---|---|
| `npm run type-check` (web + server) | ✅ clean |
| `npm test` | ✅ 720 passed (42 files) |
| `npm run lint` | ⚠️ 1 error + 10 warnings — **all in untracked dev-lab scratch** (`app/web/app/comment-lab/`, `share-card-lab/`) |

The lint error lives in experimental lab routes that are **not committed**, so CI (which only sees committed code) is green. Locally it makes `npm run lint` red. Fix: either remove the lab scratch or add the lab dirs to `globalIgnores` in `app/web/eslint.config.mjs` (`app/comment-lab/**`, `app/share-card-lab/**`, `app/evo-preview/**`). Production app code lints clean.

> **Build job unverified locally** — `npm run build` (Next production build) was not run during install (slow + may need real env). If it fails in CI for missing public env, add the values as repo secrets (see the `build` job comment in `ci.yml`).

## Local ↔ CI mirror

The pre-PR gate (`.claude/workflows/pre-pr-gate.md`) runs the **same four checks CI runs** — lint, typecheck, build, tests — plus the review loop and docs sync. If CI ever fails on something the local gate passed, add the missing check to the local gate. The point of the mirror: you find failures in seconds locally, not minutes later in CI.

## CI job (G4) — `.github/workflows/ci.yml`

One job, `quality-gate`, runs the **same command developers run locally** so local and CI cannot drift:

```bash
npm run quality:gate      # scripts/quality-gate.mjs → lint · typecheck · build · test → one report + one exit code
npm run review:aggregate  # scripts/review/aggregate.mjs → exits 1 on any committed critical finding
```

It uploads `.quality/` (the machine-readable quality + review reports) as a build artifact on every run, pass or fail. Mark `quality-gate` a **required** check on `master` via branch protection — that flips G4 from advisory to enforced. The local pre-PR gate (`.claude/workflows/pre-pr-gate.md`) runs the identical command — it *is* the twin, not a re-implementation.

## Enforcement scripts (the tooling that makes gates real)

| Script | npm alias | Enforces | Exit |
|---|---|---|---|
| `scripts/quality-gate.mjs` | `quality:gate` | lint+typecheck+build+test in one report | 1 if any check fails |
| `scripts/review/route.mjs` | `review:route` | deterministic reviewer routing from the diff | 0 (advisory plan) |
| `scripts/review/aggregate.mjs` | `review:aggregate` | severity totals; **critical blocks** | 1 if any critical / schema error |

## Hard, non-negotiable gates (never bypass)

These fail the gate with no override:
- **AI Boundary** — classifier is read-only (Security reviewer, G3).
- **Red tests** — `npm test` must be green (G2/G4).
- **Secret in diff** — no keys/tokens committed (G3 Security).
- **Console error on a benchmark UI screen** (G3 UI).

## Degrade-safe principle

Every hook and local check degrades safe: a missing tool (no eslint, no node) exits 0 and never blocks an edit on infra failure. CI is the hard backstop — it has the tools and *does* block. This mirrors the existing `eslint-on-edit.sh` behavior.

## Planned hardening (not in this pass)

The approved plan also defined hook-level hard gates (a pre-commit scoped-test gate and a Stop-hook definition-of-done) and CI additions (coverage floor, migration-drift guard, secret scan). They are **documented here as planned** and ship in a later phase via `.claude/settings.json` + extended CI. Until then, G3 (review loop) + G4 (CI) carry the enforcement.

See also: `docs/REVIEW_PROCESS.md` (G3 detail), `docs/LOOP_ENGINEERING.md` (the loop model).
