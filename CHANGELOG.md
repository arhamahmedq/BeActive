# Changelog

All notable changes to the loop-engineering / quality system. Newest first.

## 2026-06-21 — Enforcement layer (docs → tooling)

### Added
- **Active quality gate** — `scripts/quality-gate.mjs` (`npm run quality:gate`): runs lint + typecheck + build + test, writes `.quality/quality-report.{json,md}`, exit 1 on any failure. `--quick` skips build; `--only=`/`--skip=` for scoping.
- **Deterministic review router** — `scripts/review/route.mjs` (`npm run review:route`): turns the diff into `.quality/review-plan.json` (which reviewers apply + why). Validated: routed 159 changed files → security+qa (always-on), ui (12), startup-pm (1).
- **Findings aggregator** — `scripts/review/aggregate.mjs` (`npm run review:aggregate`): reads `.quality/findings/*.json`, totals by severity, **exits 1 on any critical** (validated: synthetic critical → exit 1; clean → exit 0). Also fails on schema errors.
- **Findings schema** — `scripts/review/finding.schema.json` (severities `critical|high|medium|low`).
- **Project ledgers** — `CHANGELOG.md`, `TODO.md`, `RISKS.md`, `DECISIONS.md`.
- **GAP_ANALYSIS.md** — audit classifying every component by automation level + the implementation plan.

### Changed
- **CI** (`.github/workflows/ci.yml`) — collapsed the 4 parallel jobs into one `quality-gate` job that runs the **same** `npm run quality:gate` command as local (no local↔CI drift), runs `review:aggregate`, and uploads `.quality/` as an artifact on every run.
- **Severity unified** to Critical/High/Medium/Low across `REVIEW_PROCESS.md`, all 5 reviewer skills, and the aggregator (was Blocker/Major/Minor).
- **Workflows made executable** — `review-loop.md` and `pre-pr-gate.md` now drive the scripts instead of describing prose steps.
- **5 reviewer skills** now emit machine-readable findings JSON instead of a prose `BLOCKERS: <n>` line.
- **Browser validation** documented in `REVIEW_PROCESS.md` (Playwright MCP confirmed available).

### Fixed
- **Lint baseline green** — fixed a real React anti-pattern (synchronous `setState` in an effect → cascading renders) in `app/web/app/comment-lab/ConceptHuddle.tsx` by moving the reset into the effect cleanup. Lint was red before; `quality:gate` lint step now passes. (Source fixed, not config weakened — the config-protection hook correctly blocked the easy way out.)

### Baseline verified
typecheck ✅ · tests ✅ 720 passed (42 files) · lint ✅ · all 3 scripts execute with correct exit codes.

---
## (prior) 2026-06-21 — Loop-engineering framework (documentation)
- Created `docs/{LOOP_ENGINEERING,QUALITY_GATES,REVIEW_PROCESS}.md`, `.claude/{skills,reviewers,checklists,workflows}/` (5 reviewers each), and the initial 4-job `ci.yml`.
