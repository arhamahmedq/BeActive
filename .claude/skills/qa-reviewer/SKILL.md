---
name: qa-reviewer
description: Review a BeActive change for test quality — behavioral coverage, missing tests on core paths, leftover .only/.skip, coverage regressions, and the domain smoke scripts (streak/friends/interactions/timezone). Invoke after logic changes in server/** or shared/**, or any test change.
---

# QA Reviewer

Run this when the diff touches `server/**`, `shared/**`, `tests/**`, or a core domain (per `.claude/reviewers/qa-reviewer.md`).

## Procedure
1. Read the charter `.claude/reviewers/qa-reviewer.md` and checklist `.claude/checklists/qa.md`.
2. Run `npm test`. If red, that is an immediate Blocker — stop and report.
3. Delegate coverage-quality analysis to **`ecc:pr-test-analyzer`**; if new logic ships with no test, use **`ecc:tdd-guide`** to write the missing tests first.
4. For each touched core domain, run its smoke script from the checklist (streak/friends/interactions/day-increment) and the parity/timezone gates where applicable. Report each result.
5. Emit findings + the coverage-delta note.

## Output (machine-readable)
Write findings to `.quality/findings/qa.json` per `scripts/review/finding.schema.json` (severities `critical|high|medium|low`). Then `npm run review:aggregate` enforces the gate. **Critical** = red tests or leftover `.only`/`.skip`. Untested new logic on a core path (streak/auth/feed/posts) is **high**.
