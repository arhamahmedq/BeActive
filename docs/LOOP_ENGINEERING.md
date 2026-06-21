# LOOP_ENGINEERING.md — BeActive's Loop-Engineered Development System

> **What this is:** the index and philosophy for how changes get built and verified on BeActive. The goal is a development loop where quality is enforced by tooling, not by remembering to be careful.

## 1. The three loops

Quality is enforced at three nesting levels. Each inner loop must close before the outer one advances.

```
OUTER  — Task loop:   spec → build → verify → review (5 reviewers) → docs → gate → PR
MIDDLE — Build loop:  edit → PostToolUse lint/typecheck → fix → ✓   (per file)
INNER  — Verify loop: run scoped tests → fail → fix → green          (per unit)
                              ↓ PR opened
CI GATE — deterministic, required: lint · typecheck · build · tests
```

- **Middle loop** = hooks. Fast, every edit (`.claude/hooks/eslint-on-edit.sh`).
- **Inner loop** = scoped tests, Claude-driven per unit.
- **Outer loop** = the review system + doc sync, orchestrated by `.claude/workflows/`.
- **CI gate** = `.github/workflows/ci.yml`, the backstop neither human nor Claude bypasses.

## 2. The five reviewers

Built around BeActive's actual risks. Each is a thin charter binding a checklist to an existing **ECC** agent — we reuse, we don't reimplement.

| Reviewer | Guards against | Backing ECC agent |
|---|---|---|
| **UI/UX** | SaaS-looking, broken-on-mobile, inaccessible UI | `ecc:a11y-architect` + Playwright MCP |
| **QA** | untested logic, coverage theater, red tests | `ecc:pr-test-analyzer`, `ecc:tdd-guide` |
| **Security** | AI-boundary breach, missing Zod/auth, secret leaks | `ecc:security-reviewer` |
| **Startup PM** | scope creep, identity drift, unjustified infra | `ecc:product-lens` |
| **Mobile Perf** | serverless timeouts, N+1, heavy bundles | `ecc:performance-optimizer`, `ecc:database-reviewer` |

Full routing + invocation: **`docs/REVIEW_PROCESS.md`**.

## 3. File map

```
docs/
  LOOP_ENGINEERING.md   ← you are here (index + philosophy)
  QUALITY_GATES.md      ← the gate matrix G0–G5
  REVIEW_PROCESS.md     ← how to invoke each reviewer

.claude/
  skills/<name>-reviewer/SKILL.md   ← invocable entry points (the 5 reviewers)
  reviewers/<name>-reviewer.md      ← charters (contract per reviewer)
  checklists/<domain>.md            ← reusable checks
  workflows/review-loop.md          ← fan-out + fix loop
  workflows/pre-pr-gate.md          ← local twin of CI
  hooks/eslint-on-edit.sh           ← G0 (existing)

.github/workflows/ci.yml            ← G4: lint · typecheck · build · tests
```

## 4. The gate matrix (summary)

G0 Edit (lint hook) · G1 Typecheck · G2 Tests · G3 Review (5 reviewers) · G4 CI (required) · G5 E2E (planned). Detail + blocking behavior in `QUALITY_GATES.md`.

## 5. ECC reuse map (why we don't reinvent)

The environment ships 50+ reviewer agents and many skills. This system is **glue**, not a parallel universe: charters point at `ecc:*` agents; the review loop maps onto ECC's `/code-review` and `/santa-loop`; MCP servers (`playwright`, `github`, `context7`, `vercel`) are already installed. New code here is limited to repo-specific checklists, charters, skills, two workflow docs, and the CI job split.

## 6. How to extend

Adding a new reviewer:
1. Write a checklist in `.claude/checklists/<domain>.md`.
2. Write a charter in `.claude/reviewers/<name>-reviewer.md` (trigger paths, backing ECC agent, hard invariants, blocker threshold, output format).
3. Write a skill in `.claude/skills/<name>-reviewer/SKILL.md` (procedure that reads the charter + checklist and delegates).
4. Add its row to the routing table in `docs/REVIEW_PROCESS.md` and `.claude/workflows/review-loop.md`.

Adding a gate: add it to `QUALITY_GATES.md`, wire it into `pre-pr-gate.md` (local) and `ci.yml` (CI) so the mirror holds.

## 7. Principles

- **Reuse before build** (Ponytail). Lean on ECC; write only the repo-specific glue.
- **Degrade safe.** Local checks never block on infra failure; CI is the hard backstop.
- **Conditional fan-out.** A reviewer runs only when its trigger paths changed.
- **Local mirrors CI.** Find failures in seconds, not minutes.
- **Architecture.md wins** all contradictions (per `CLAUDE.md §16`).
