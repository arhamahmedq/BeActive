# loops/review — Five-Reviewer Loop

**Goal:** Catch what the deterministic gate can't — UI/UX, QA depth, security, scope/identity, mobile-perf — and block on anything `critical`. Full process: `docs/REVIEW_PROCESS.md`.

## Workflow

1. `npm run review:route` — diff → `.quality/review-plan.json` (which of the 5 reviewers apply + why). Security + QA are always-on; ui/startup-pm/mobile-performance route by changed paths.
2. For each routed reviewer, run its skill (`.claude/skills/<name>-reviewer/SKILL.md`) against its charter (`.claude/reviewers/`) and checklist (`.claude/checklists/`). Each writes `.quality/findings/<reviewer>.json` (schema: `scripts/review/finding.schema.json`).
3. `npm run review:aggregate` — totals by severity; **exit 1 on any `critical`**.
4. Resolve every Critical and High this pass (or defer a High with a written reason).
5. Re-run until clean. Record the verdict line in `loops/logs.md`.

## The five reviewers

| Reviewer | Guards against | Backing ECC agent |
|---|---|---|
| ui | SaaS-looking / broken-mobile / inaccessible | `ecc:a11y-architect` + Playwright MCP |
| qa | untested logic, coverage theater | `ecc:pr-test-analyzer`, `ecc:tdd-guide` |
| security | AI-boundary breach, missing Zod/auth, secrets | `ecc:security-reviewer` |
| startup-pm | scope creep, identity drift, unjustified infra | `ecc:product-lens` |
| mobile-performance | serverless timeouts, N+1, heavy bundles | `ecc:performance-optimizer`, `ecc:database-reviewer` |

## Boundaries

- Severity rubric is fixed: `critical|high|medium|low` — only `critical` blocks the aggregator (`finding.schema.json`).
- Reviewers **only emit findings** — they don't edit code. Fixes go back through `loops/dev`.
- This loop runs **local pre-PR**; in CI `review:aggregate` sees no findings files and passes trivially (`.quality/` is gitignored). It is a local discipline, not a server gate — see `RISKS.md` R3/R5 and `docs/FINAL_ACTIVATION_STATUS.md` risk #2.

## Backlog / Timeline

Backlog of review-system hardening → `TODO.md` (P1/P2). Run history → `loops/logs.md` (filter `review:`).
