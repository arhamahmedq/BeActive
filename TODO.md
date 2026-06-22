# TODO — Loop-Engineering System

Follow-ups to push the system from "enforced locally + in CI" to "fully autonomous". Priority: P0 highest.

## P0 — close the enforcement gaps
- [ ] **Make `quality-gate` a required check** on `master` (branch protection). Until then CI is advisory — it runs but can't block a merge. *(Needs repo admin; can't be done from code.)*
- [ ] **Verify the CI `build` step** with real env. `npm run build` was not run locally (slow/env). If it fails in CI for missing public env, add repo secrets (`NEXT_PUBLIC_*`, etc.). Until verified, the build gate is unproven.

## P1 — stronger gates (the approved-but-deferred Phase 1 hooks)
- [ ] **Pre-commit hook** → run `npm run quality:gate --quick` and block the commit on red (`.claude/settings.json`, degrade-safe).
- [ ] **Stop-hook definition-of-done** → block stopping while `review-report.json` shows `blocked: true` or `quality-report.json` shows `passed: false`.
- [ ] **Coverage floor** in `quality:gate` (start at current %, ratchet up; fail on regression).
- [ ] **Migration-drift guard** in CI — `prisma migrate diff --exit-code` (targets the 2026-06-13 outage class).

## P2 — breadth
- [ ] **E2E in CI** — `e2e.yml` (nightly → required) running `tests/e2e` with the `ecc:e2e-runner` quarantine pattern.
- [ ] **Browser-evidence automation** — a Playwright spec that snapshots key routes at 390/1440px and asserts zero console errors, feeding `ui` findings without manual MCP steps.
- [ ] **Secret scan** job (gitleaks) in CI.
- [ ] **Docs-match-implementation check** — a script asserting every `npm run` alias referenced in docs exists, and every reviewer skill has a matching charter+checklist.

## Notes
- `.quality/` is gitignored; review findings are produced per-run and not committed. CI's `review:aggregate` therefore only blocks on findings a developer deliberately commits.
- Reviewer *judgment* is LLM-driven; the tooling enforces routing, structure, and severity-gating — not the correctness of the judgment itself. See `RISKS.md`.
