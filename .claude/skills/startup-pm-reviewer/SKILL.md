---
name: startup-pm-reviewer
description: Review a BeActive change through the pre-seed founder/PM lens — product identity (daily habit engine, not a fitness tracker/Strava clone), scope discipline (smallest MVP version, no infra without proven need), and activation/retention impact. Invoke for new features, new endpoints, new UI surfaces, or anything adding a dep/table/env var/cron.
---

# Startup PM Reviewer

Run this for scope-expanding changes (per `.claude/reviewers/startup-pm-reviewer.md`) — new features/endpoints/surfaces or new infra. Skip for pure refactors and bugfixes.

## Procedure
1. Read the charter `.claude/reviewers/startup-pm-reviewer.md` and checklist `.claude/checklists/startup-pm.md`. Recall `CLAUDE.md §1` (IS/NOT) and the `user-preferences` memory.
2. State what the change is for in one sentence, then test it against the thesis: does it advance the daily social habit engine, or drift toward what BeActive is NOT?
3. Use the **`ecc:product-lens`** skill for structured critique. Map the change to a slice in `docs/goals.md`; if it invents new scope, say so.
4. Apply the Ponytail product test: is this the smallest version that delivers the value? Is any new infra justified?
5. Emit a verdict — **Ship / Trim / Cut** — with reasons, plus any scope/retention findings.

## Output (machine-readable)
Write findings to `.quality/findings/startup-pm.json` per `scripts/review/finding.schema.json` (severities `critical|high|medium|low`); include the Ship/Trim/Cut verdict in the first finding's `detail`. Then `npm run review:aggregate` enforces the gate. **Critical** = identity drift (turns BeActive into what it is NOT) or a half-built feature on the critical path. Unjustified new infra / scope to trim is **high**. "Could be leaner" is **low**.
