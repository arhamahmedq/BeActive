---
name: security-reviewer
description: Review a BeActive code change for security — AI-boundary violations, missing Zod/auth, secret leaks, append-only event breaches, response-hygiene issues. Invoke when the diff touches API routes, auth, uploads, cron, queue, the AI module, or env/secret handling.
---

# Security Reviewer

Run this when the diff touches any path in `.claude/reviewers/security-reviewer.md` → Trigger paths.

## Procedure
1. Read the charter `.claude/reviewers/security-reviewer.md` and checklist `.claude/checklists/security.md`.
2. Get the diff: `git diff` (working tree) or the PR diff if reviewing a PR.
3. Delegate the deep pass to the **`ecc:security-reviewer`** agent, passing it the charter's hard invariants as the rubric. (Use the Agent tool only when the user invoked a review loop/gate — don't auto-spawn.)
4. Walk the checklist yourself against the diff for the BeActive-specific invariants the generic agent won't know (AI Boundary, append-only events, 404-not-403, QStash/cron signature).
5. Emit findings in the charter's output format. End with the literal line `AI-Boundary: PASS` or `AI-Boundary: FAIL`.

## Output (machine-readable)
Write findings to `.quality/findings/security.json` per `scripts/review/finding.schema.json` (severities `critical|high|medium|low`). Then `npm run review:aggregate` enforces the gate. **Critical** = any AI-Boundary breach, missing auth/Zod on a mutation, secret leak, or append-only violation — these block completion. Auth/AI/secret-path issues that aren't outright breaches are **high**.
