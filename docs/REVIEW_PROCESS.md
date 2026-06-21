# REVIEW_PROCESS.md — How Claude Code Invokes Each Reviewer

> The operational runbook for the BeActive review system. If you changed code and are about to commit or open a PR, this is the page that tells you which reviewers to run and how.

The system has three layers, each a separate file so they stay DRY:

| Layer | Lives in | Role |
|---|---|---|
| **Skill** | `.claude/skills/<name>-reviewer/SKILL.md` | The invocable entry point — what Claude runs via the Skill tool. |
| **Charter** | `.claude/reviewers/<name>-reviewer.md` | The contract — trigger paths, backing ECC agent, hard invariants, blocker threshold, output format. |
| **Checklist** | `.claude/checklists/<domain>.md` | The reusable checks the reviewer walks. |

A skill reads its charter + checklist; the charter names the backing **ECC agent** that does the heavy lifting. We reuse ECC reviewers — we do not reimplement them.

---

## The five reviewers

| Reviewer | Skill to invoke | Backing ECC agent(s) | Fires when the diff touches… |
|---|---|---|---|
| UI/UX | `ui-reviewer` | `ecc:a11y-architect` + Playwright MCP | components, `(main\|auth)` pages, styles, card libs |
| QA | `qa-reviewer` | `ecc:pr-test-analyzer`, `ecc:tdd-guide` | `server/**`, `shared/**`, `tests/**`, core domains |
| Security | `security-reviewer` | `ecc:security-reviewer` | API routes, auth, AI, uploads, cron, queue, env/secrets, schema |
| Startup PM | `startup-pm-reviewer` | `ecc:product-lens`, `ecc:product-capability` | new feature/endpoint/surface, new dep/table/env/cron |
| Mobile Perf | `mobile-performance-reviewer` | `ecc:performance-optimizer`, `ecc:database-reviewer` | Prisma/repos, feed, image pipeline, AI path, new dep |

`security-reviewer` and `qa-reviewer` run on **every** non-trivial code change. The other three are conditional on their trigger paths.

---

## How to invoke a single reviewer

1. **Skill tool** — `Skill(security-reviewer)`. The skill walks its procedure: read charter + checklist, pull the diff, delegate to the backing ECC agent, walk the BeActive-specific invariants, emit findings + `BLOCKERS: <n>`.
2. The backing agent is spawned via the **Agent tool** *by the skill*, only inside an explicit review pass — reviewers are never auto-fired on every edit (cost + noise control).

Example — you just edited `app/web/app/api/posts/create/route.ts`:
> That path matches the Security and Mobile-Perf trigger lists (and QA, since it has logic). Run `security-reviewer` (always), `qa-reviewer` (always), and `mobile-performance-reviewer` (API + posts path). Skip `ui-reviewer` and `startup-pm-reviewer` — no UI, no new scope.

## How to invoke the full loop (script-driven)

1. **Route** — `npm run review:route` → `.quality/review-plan.json` (deterministic: which reviewers apply, and why).
2. **Review** — for each reviewer in the plan, invoke its skill; write findings to `.quality/findings/<id>.json` (schema below).
3. **Aggregate** — `npm run review:aggregate` → `.quality/review-report.md` + exit code (critical → exit 1).
4. **Fix loop** — if blocked: fix criticals → refresh the affected findings file(s) → re-run `review:aggregate` (≤3 iterations).
5. **Gate** — `npm run quality:gate` must pass (lint · typecheck · build · test).
6. **Docs** — sync per `CLAUDE.md §18`.

Full procedure: `.claude/workflows/review-loop.md`. Pre-PR gate: `.claude/workflows/pre-pr-gate.md`.

---

## Severity rubric (shared by all reviewers — enforced by `scripts/review/aggregate.mjs`)

| Severity | Meaning | Effect on the gate |
|---|---|---|
| **critical** | Breaks a hard invariant / ships a bug / violates a NON-NEGOTIABLE (AI Boundary, red tests, secret leak, console error on a benchmark screen). | **BLOCKS completion** — `aggregate.mjs` exits 1. Must fix + re-review. |
| **high** | Real problem that should be fixed this pass. | Fix now, or defer with an explicit rationale logged in `TODO.md`. Surfaced in the report. |
| **medium** | Worth fixing soon; not urgent. | Noted in the report. |
| **low** | Polish, nit, nice-to-have. | Noted. |

(Older docs used Blocker/Major/Minor — read those as critical/high/medium.)

## Machine-readable output (the enforcement contract)

Each reviewer writes **one file** `.quality/findings/<reviewer>.json` matching `scripts/review/finding.schema.json`:

```json
{ "reviewer": "security",
  "findings": [
    { "severity": "critical", "file": "app/web/app/api/x/route.ts", "line": 12,
      "title": "Missing auth middleware on mutation", "detail": "why it matters", "fix": "wrap with requireAuth" }
  ] }
```

`npm run review:aggregate` reads every findings file, totals by severity, writes `.quality/review-report.{json,md}`, and **exits 1 on any critical** (or any schema error). That exit code is what makes "critical blocks" real — a human/CI/Claude cannot proceed past it without fixing.

---

## Output contract

A review pass ends with a one-screen summary:
- Reviewers run (and which were skipped, with the reason).
- `BLOCKERS: <n>` — and how each was resolved.
- Majors deferred, each with a rationale.
- Minors listed.
- For Security: the explicit `AI-Boundary: PASS/FAIL` line.
- For UI: before/after screenshots (mobile + desktop).

---

## Browser-based validation (UI changes) — Playwright MCP

Playwright MCP **is available** in this environment (`mcp__playwright__*`). For any change the router sends to `ui`, the UI reviewer must gather live evidence before writing findings:

1. Start the app — `npm run dev` (localhost:3000). Log in if the page is behind auth.
2. `browser_navigate` to each affected route.
3. `browser_resize` to **390×844** (mobile) and **1440×900** (desktop); `browser_take_screenshot` at each.
4. `browser_console_messages` — **any error → a `high` (or `critical` on a benchmark screen) finding.**
5. Check responsive layout: no horizontal overflow, tap targets ≥44px, no clipped content.
6. Save screenshots under `.quality/screenshots/<route>-<width>.png` and reference them in the `ui` findings' `detail`.

If Playwright MCP were unavailable, the fallback is the Playwright test runner: add a spec under `tests/e2e/` that navigates the routes, asserts `expect(consoleErrors).toEqual([])`, and snapshots at both widths via `page.setViewportSize` — run in `e2e.yml` (planned). Either way, console-error evidence feeds the UI reviewer's findings JSON.

## Relationship to the gates

Reviewers are **Gate G3** in `QUALITY_GATES.md`. They sit between local build (G0–G2) and CI (G4). A clean review loop is a precondition for the pre-PR gate, which is the local twin of the required CI checks.

See also: `docs/LOOP_ENGINEERING.md` (the why), `docs/QUALITY_GATES.md` (the gate matrix).
