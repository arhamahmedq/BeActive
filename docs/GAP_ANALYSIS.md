# GAP_ANALYSIS.md — From Documentation to Enforcement

> **Date:** 2026-06-21 · **Scope:** everything created for the loop-engineering framework + the existing CI/scripts/test infra.
> **Verdict:** the framework is **~90% documentation, ~10% enforcement**. Exactly one mechanism actually *blocks* anything today (the ESLint edit hook). This report maps every component and defines the work to make quality tooling-enforced, not self-reported.

---

## 1. Component inventory by automation level

### 1.1 Documentation-only (read by a human/LLM; enforces nothing)
| Component | Reality |
|---|---|
| `docs/LOOP_ENGINEERING.md`, `QUALITY_GATES.md`, `REVIEW_PROCESS.md` | Describe the system. No code runs them. |
| `.claude/skills/*-reviewer/SKILL.md` (×5) | Prompts. Only act if Claude *chooses* to invoke them. No trigger, no output contract enforced. |
| `.claude/reviewers/*.md` (×5 charters) | Contracts. Inert text. |
| `.claude/checklists/*.md` (×5) | Human/LLM checklists. Nothing parses or asserts them. |
| `.claude/workflows/review-loop.md`, `pre-pr-gate.md` | Procedures written in prose. **Not executable** — no script implements the "fan out → aggregate → block" loop. |

### 1.2 Requires manual execution (a human must remember to run it)
| Component | Reality |
|---|---|
| `qa-streak.mjs`, `qa-friends.mjs`, `qa-interactions.mjs`, `qa-day-increment.mjs` | Need a live dev server; run by hand; results read by eye. |
| `scripts/audit-timezones.mjs`, `backfill-completions.mjs`, `validate-streak-parity.mjs` | Manual maintenance/QA scripts. |
| `npm run type-check` / `lint` / `test` / `build` | Exist as scripts but nothing aggregates them or blocks "done" on them locally. |
| The 5 reviewers | Invoked only when a human asks Claude to review. |

### 1.3 Partially automated
| Component | Reality |
|---|---|
| `.github/workflows/ci.yml` | Runs lint/typecheck/build/test on push/PR — but produces **no artifacts, no aggregated report**, isn't proven a **required** check, and the `build` job is unverified. |
| Vitest suite (720 tests) | Auto-runs in CI; but **no coverage gate**, **no e2e in CI** (1 Playwright spec runs only by hand). |

### 1.4 Fully automated (actually enforces, with no human in the loop)
| Component | Reality |
|---|---|
| `.claude/hooks/eslint-on-edit.sh` (PostToolUse) | The **only** real-time enforcement: lints every edited `app/web` file, exit 2 feeds errors back. This is the one piece doing its job. |

---

## 2. Missing enforcement mechanisms
1. **No single "is this done?" gate.** Nothing runs lint+typecheck+build+test together and returns one pass/fail. "Done" is a vibe.
2. **No severity-based blocking.** Reviewers emit prose; nothing parses "Critical" and refuses to proceed.
3. **No machine-readable review output.** Findings live in chat, not in files a gate can read.
4. **No pre-commit / pre-push gate.** Red code can be committed and pushed freely (only CI catches it, late).
5. **No required-status enforcement.** CI can be red and a merge still possible (branch protection not asserted).
6. **Reviewers have no trigger.** They depend on Claude *remembering*. The routing table is prose, not a script.
7. **The "autonomous loop" doesn't exist as code** — only as a description in `review-loop.md`.

## 3. Missing validation mechanisms
1. **Build never validated** locally; CI build unproven.
2. **No findings-schema validation** — nothing checks a reviewer actually produced structured output.
3. **No docs-match-implementation check** — docs can drift from scripts silently.
4. **No console-error / responsive-layout validation** for UI changes (Playwright MCP available but unwired).
5. **No coverage floor** — coverage can silently rot.
6. **Local lint is red** (pre-existing error in untracked `app/comment-lab/` scratch) — the gate is dead-on-arrival locally until labs are ignored.

## 4. Architecture weaknesses
1. **Severity taxonomy mismatch.** Checklists say *Blocker/Major/Minor*; this objective wants *Critical/High/Medium/Low*. Two vocabularies = no machine can act on either.
2. **Enforcement/judgment boundary is blurred.** The docs imply scripts "do" security review. They can't — that's LLM judgment. The system needs an explicit split: **deterministic harness** (routing, gating, aggregation) vs **LLM judgment** (the actual review).
3. **No output directory / contract.** Reviewers have nowhere to write and no schema to write in.
4. **Single point of enforcement** (one edit hook) — fragile.
5. **CI and local checks aren't bound to one source of truth** — they can diverge.

## 5. Opportunities for stronger feedback loops
1. **One command** — `npm run quality:gate` → runs all four checks, writes `.quality/quality-report.{json,md}`, exits non-zero on any failure. Usable locally *and* in CI (same code = no drift).
2. **Deterministic review routing** — `scripts/review/route.mjs` turns `git diff --name-only` into a machine-readable plan of which reviewers apply. Removes "did Claude remember?".
3. **Findings as data** — reviewers write `.quality/findings/<reviewer>.json` against a fixed schema; `scripts/review/aggregate.mjs` totals by severity and **exits 1 on any Critical**. Now "Critical blocks" is code, not a promise.
4. **CI artifacts** — upload the quality + review reports so every PR carries machine-readable evidence.
5. **Browser evidence** — Playwright MCP is available; wire a documented capture flow (mobile+desktop screenshots, console-error check) feeding the UI reviewer.
6. **Unify severity** on Critical/High/Medium/Low everywhere; Critical (and unresolved High) block.

---

## 6. Implementation Plan (executed in this same run — not deferred)

**Principle:** deterministic tooling does routing + gating + aggregation; the LLM reviewers do judgment and emit structured findings the tooling enforces. Reuse Node stdlib + existing npm scripts; add zero runtime deps.

| # | Build | File(s) | Enforces |
|---|---|---|---|
| P1 | **Quality gate runner** — runs lint, typecheck, build, test; aggregates to one JSON+MD report; exit code = pass/fail | `scripts/quality-gate.mjs`, npm `quality:gate` | "done" requires all four green |
| P2 | **Review router** — diff → reviewer plan (machine-readable) | `scripts/review/route.mjs`, npm `review:route` | reviewers fire deterministically |
| P3 | **Findings aggregator** — read findings JSON → severity report → block on Critical | `scripts/review/aggregate.mjs`, npm `review:aggregate` | Critical findings block completion |
| P4 | **Findings schema + output dir** | `scripts/review/finding.schema.json`, `.quality/` (gitignored) | structured, validatable review output |
| P5 | **Severity unification** to Critical/High/Medium/Low | `REVIEW_PROCESS.md`, 5 skills, charters | one vocabulary the tooling acts on |
| P6 | **Executable workflows** — wire `review-loop.md`/`pre-pr-gate.md` to the scripts | 2 workflow docs | the loop is runnable, not just described |
| P7 | **CI enhancement** — quality-gate job + artifact upload + report | `.github/workflows/ci.yml` | evidence on every PR |
| P8 | **Browser validation** — Playwright MCP procedure for UI changes | `REVIEW_PROCESS.md` §browser | UI evidence feeds reviews |
| P9 | **Repo health** — ignore lab scratch so lint is green; `.gitignore` `.quality/` | `eslint.config.mjs`, `.gitignore` | the gate works on a clean baseline |
| P10 | **Project ledgers** — CHANGELOG / TODO / RISKS / DECISIONS | 4 root docs | maintainability + traceability |

**Then:** self-critique as 5 roles → improve → validate (run every script) → update ledgers → final report.

### The autonomous loop (P6) as executable steps
```
1. implement            (Claude edits)
2. npm run quality:gate (deterministic) ──fail──► fix ──► repeat
3. npm run review:route (deterministic) → review-plan.json
4. run matched reviewers (LLM) → write .quality/findings/<r>.json
5. npm run review:aggregate ──Critical>0──► fix ──► back to 2
6. all green + 0 Critical → complete
```
Steps 2,3,5 are code (enforced). Step 4 is judgment (structured). That boundary is the whole design.
