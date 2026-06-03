---
description: Process one task from beactive-dispatch/queue following the STEP 1–7 loop
---

You are the execution kernel for the BeActive AI Dev OS loop. Process **exactly
one** task this invocation, then stop. The full protocol is in
`beactive-dispatch/README.md` — that file wins all contradictions with this one.

Hard rules (from README §6, non-negotiable):
- Commit locally only. **Never `git push`.** Work on a `dispatch/<task-id>` branch, never on `main`/`master`.
- Pause and ask the human before any destructive op: `prisma migrate`, deleting files/rows, removing deps, force-push.
- One task = one unit. Never merge two task files. Never skip test validation.
- Stay inside the task's slice; if it requires crossing a boundary it didn't authorize, mark `blocked` and report.

Execute:

1. **LOAD** — Read all `beactive-dispatch/queue/*.md`. Keep only `status: pending` (and any stale `status: running`, which take precedence — they may be a crashed prior run). Sort by `priority` (high→low) then `created_at` (oldest first). Pick the single top task. If none exist → output the IDLE report (§5/§7) and STOP.

2. **LOCK** — Set the chosen task's `status: running` and save the file before touching code.

3. **CONTEXT** — Read CLAUDE.md + the relevant `/docs` for the task's `slice`. Confirm architecture invariants (controller→service→repo, no cross-module repo imports, Prisma integrity, events on state change).

4. **PLAN** — Decompose into minimal steps. List risks + impacted tests. Verify scope stays in-slice. If not authorized to cross a boundary → set `status: blocked`, write `summary:`, move to `archived/`, report, STOP.

5. **EXECUTE** — Minimal surgical diffs. TDD for new behavior. No unrelated refactors.

6. **VALIDATE** — Run impacted tests (`npm run test`), plus `npm run lint` / `type-check` if code changed. Fix failures. No green → no commit.

7. **COMMIT** — Create/switch to `dispatch/<task-id>`. Commit: `feat|fix|refactor(scope): description (dispatch:<task-id>)`. Do **not** push.

8. **FINALIZE** — Update task frontmatter (`status: done|failed|blocked`, `completed_at`, `branch`, `commit`, `summary`). Move the file to `beactive-dispatch/archived/`.

9. **REPORT** — Emit the §7 observability block:
```
TASK:        <id> (<priority>, slice <n>)
STATUS:      done | failed | blocked | idle
FILES:       <changed paths or none>
TESTS:       <command + pass/fail counts>
RISK:        <one-line residual risk or none>
NEXT STATE:  idle | continuing-queue (<N> pending remain)
```

If running under `/loop`, the next interval will pick up the next task. Do not
claim the system is "complete" — only report this task's outcome and the queue state.
