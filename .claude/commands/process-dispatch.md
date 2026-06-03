---
description: Process one task from beactive-dispatch/queue following the hardened STEP 0–9 loop
---

You are the execution kernel for the BeActive AI Dev OS loop. Process **exactly
one** task this invocation, then stop. The full protocol is in
`beactive-dispatch/README.md`; the formal lifecycle/recovery rules are in
`beactive-dispatch/CONTRACT.md`; the deterministic mechanics (state edges, task
selection, stale-lock math) are defined and tested in
`beactive-dispatch/lib/dispatch.ts`. These three must agree — if mechanics are in
doubt, the lib wins; if policy is in doubt, CONTRACT.md §10 wins.

Hard rules (CONTRACT §10, non-negotiable):
- Commit locally only. **Never `git push`. Never merge. Never deploy.** Work on a `dispatch/<task-id>` branch, never on `master`.
- Pause and ask the human before any destructive op: `prisma migrate`, deleting files/rows, removing deps, force-push.
- One task = one unit. Never merge two task files. Never skip test validation.
- Stay inside the task's slice; if it needs un-authorized scope, mark `blocked` and report.

Execute:

0. **CYCLE LOCK** — Acquire the mutex: `mkdir beactive-dispatch/.lock` (atomic). If it already exists and is fresh (< 1h old) → another cycle is live; abort and report. If it exists but is stale (≥ 1h) → reclaim it (`rmdir`/recreate). Always remove `.lock` before you finish (success, failure, or abort).

1. **RECOVER** — Before loading, reclaim crashed work (CONTRACT §6). Read `queue/*.md`. For any task already `status: running`: it is orphaned (single-cycle invariant). If its `dispatch/<task-id>` branch already holds the committed work, finish the transition forward (→ `done`, archive, outbox). Otherwise re-queue it: set `status: pending`, clear `locked_at`/`lock_owner`, leave in `queue/`. Use `isStaleLock` semantics from the lib.

2. **LOAD** — From `queue/*.md`, keep only `status: pending`. Select the single winner by the lib's `selectNextTask` order: priority (high→low), then `created_at` (oldest first), then `id`. If none → remove `.lock`, output the IDLE report (§9, console only, no outbox), STOP.

3. **LOCK** — Set the task's `status: running`; stamp `locked_at` (ISO-8601 UTC) and `lock_owner` (a fresh UUID for this cycle); `git add` the task file; save — before touching any code.

4. **CONTEXT** — Read CLAUDE.md + the relevant `/docs` for the task's `slice`. Confirm architecture invariants (controller→service→repo, no cross-module repo imports, Prisma integrity, events on state change).

5. **PLAN** — Decompose into minimal steps. List risks + impacted tests. Verify scope stays in-slice. If un-authorized to cross a boundary → `status: blocked`, write `summary`, archive, write outbox, REPORT, remove `.lock`, STOP (Path C).

6. **EXECUTE** — Minimal surgical diffs. TDD for new behavior. No unrelated refactors.

7. **VALIDATE** — Run impacted tests (`npm run test`), plus `npm run lint` / `type-check` if code changed. Fix failures. If it cannot reach green → Path B: do **not** commit failing production code; set `status: failed` + `summary` (cause), archive, write outbox, REPORT, remove `.lock`, STOP. Keep any partial branch for inspection.

8. **COMMIT** — Create/switch to `dispatch/<task-id>`. Commit: `<type>(<scope>): <description> (dispatch:<task-id>)` with the `Co-Authored-By` trailer. Do **not** push.

9. **FINALIZE + OUTBOX + REPORT**
   - Update task frontmatter: `status: done`, `completed_at`, `branch`, `commit`, `summary`. The `commit` field = the STEP-8 work sha; for audit-only tasks (no production change) use the literal `self (audit-only)` (never a self-referential sha — it goes stale on amend).
   - Move the task file `queue/ → archived/`.
   - Write the outbox report to the deterministic path `beactive-dispatch/outbox/<task-id>.md` using the `renderOutbox()` schema from `lib/dispatch.ts` (Status, Execution summary, Files changed, Commands run, Test results, Risk, Next recommendation per CONTRACT §5). Overwrite any prior report for this task — git history is the audit trail.
   - `git add` the archived task file + the outbox file; add a follow-up commit so the audit trail is captured.
   - Remove `beactive-dispatch/.lock`.
   - Emit the observability block to the console:
```
TASK:        <id> (<priority>, slice <n>)
STATUS:      done | failed | blocked | idle
FILES:       <changed paths or none>
TESTS:       <command + pass/fail counts>
RISK:        <one-line residual risk or none>
NEXT STATE:  idle | continuing-queue (<N> pending remain)
```

If running under `/loop`, the next interval picks up the next task. Do not claim
the system is "complete" — report only this task's outcome and the queue state.
