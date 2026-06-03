# Dispatch System Contract

**Status:** Phase 1 — local, standalone, single-session. No Telegram, no daemon,
no watcher, no background service. Reliability over autonomy.

This document is the **formal contract** for the BeActive dispatch kernel. The
prose kernel (`.claude/commands/process-dispatch.md`), the README protocol, and
the pure core (`lib/dispatch.ts`) must all agree with this file. For *mechanics*
(state edges, ordering, stale-lock math) `lib/dispatch.ts` is the executable
tiebreaker; for *policy* (safety gates, what a human must approve) this document
and README §6 win.

---

## 1. Components (complete system)

| Component | Path | Role |
|-----------|------|------|
| Protocol | `beactive-dispatch/README.md` | Human-facing STEP 1–9 protocol + safety |
| Contract | `beactive-dispatch/CONTRACT.md` | This file — formal lifecycle + recovery |
| Kernel | `.claude/commands/process-dispatch.md` | `/process-dispatch` — one cycle, executed by Claude |
| Core | `beactive-dispatch/lib/dispatch.ts` | Pure, tested state-machine + selection logic |
| Queue | `beactive-dispatch/queue/` | Pending/running task files (git-tracked) |
| Archive | `beactive-dispatch/archived/` | Terminal task files (git-tracked) |
| Outbox | `beactive-dispatch/outbox/` | Per-cycle execution reports (git-tracked) |
| Template | `beactive-dispatch/task.template.md` | Starting point for a new task |
| Lock | `beactive-dispatch/.lock/` | Ephemeral cycle mutex (git-IGNORED) |

A fresh clone contains every component except `.lock/` (created at runtime). No
component depends on any untracked or machine-local file.

---

## 2. Task lifecycle (state machine)

States: `pending`, `running`, `done`, `failed`, `blocked`.
`done` / `failed` / `blocked` are **terminal**.

```
            ┌─────────── LOCK ──────────┐
            ▼                           │
  pending ───► running ─────► done      │  (success)
                  │   └──────► failed    │  (validation/exec failure)
                  │   └──────► blocked   │  (scope/authorization refusal)
                  └──────────► pending   │  (stale-lock / crash recovery: re-queue)
```

Only these edges are legal (`canTransition` in `lib/dispatch.ts`). Any other
transition is a contract violation and must not be performed.

| Edge | Trigger | Side effects |
|------|---------|--------------|
| `pending → running` | LOCK: task selected for execution | write `locked_at`, `lock_owner`; `git add` task file |
| `running → done` | All validation green, commit made | write `completed_at`, `branch`, `commit`, `summary`; move to `archived/`; write outbox |
| `running → failed` | Validation failed or exec error unrecoverable | write `completed_at`, `summary` (failure reason); move to `archived/`; write outbox; branch kept for inspection |
| `running → blocked` | Task needs un-authorized scope (cross-slice, destructive) | write `summary` (why blocked); move to `archived/`; write outbox; **no code committed** |
| `running → pending` | Recovery: orphaned/stale lock, no forward progress | clear `locked_at`/`lock_owner`; leave in `queue/` |

---

## 3. Path A — `queue → running → done` (happy path)

1. **RECOVER** (see §6) — reclaim any orphaned `running` task first.
2. **LOAD** — read `queue/*.md`; `selectNextTask` picks the single winner.
3. **LOCK** — set `status: running`, stamp `locked_at` (ISO-8601 UTC) +
   `lock_owner` (per-cycle UUID), `git add` the task file, save.
4. **CONTEXT / PLAN / EXECUTE** — per README STEP 3–5.
5. **VALIDATE** — `npm run test` (+ lint/type-check if code changed) must be green.
6. **COMMIT** — branch `dispatch/<task-id>`, commit message per §8. No push.
7. **FINALIZE** — `status: done` + `completed_at`/`branch`/`commit`/`summary`;
   move file `queue/ → archived/`; write outbox report (§5); `git add` both.
8. **REPORT** — emit the §9 observability block; release the cycle lock.

## 4. Path B — `queue → running → failed`

Identical to Path A through LOCK. If EXECUTE or VALIDATE cannot reach green:

- Do **not** commit production changes that fail validation.
- Set `status: failed`, `completed_at`, and `summary` = the failure cause.
- Move `queue/ → archived/`; write outbox report with `STATUS: failed`.
- The `dispatch/<task-id>` branch (if created) is **kept**, not deleted, so a
  human can inspect partial work. No push.
- A failed task is terminal: it is never auto-retried. A human re-enqueues a new
  task (new id) if the work should be attempted again.

## 4a. Path C — `queue → running → blocked`

Used when the task demands authority it was not granted (crossing a slice
boundary, a destructive op, missing approval). No code is committed. Set
`status: blocked`, `summary` = the reason, archive, write outbox, report. Human
decides whether to re-enqueue with explicit authorization.

---

## 5. Outbox behavior (output contract)

Every completed cycle writes exactly one report file at a **deterministic path**:

```
beactive-dispatch/outbox/<task-id>.md
```

No timestamp in the name — a future bridge reads exactly one well-known file per
task. Git history supplies the append-only audit trail (each overwrite is a
commit). The renderer is the pure, tested `renderOutbox()` in `lib/dispatch.ts`,
so the kernel and any future Telegram bridge share **one** definition of the
output. Required structure (produced by `renderOutbox`):

```
---
task_id: <id>
status: done | failed | blocked
priority: <p>
slice: <n>
branch: <dispatch/...|none>
commit: <work-sha | "self (audit-only)" | none>
completed_at: <ISO-8601>
---

## Status              <done|failed|blocked>
## Execution summary   <one-line what happened>
## Files changed       <bullet list or "- none">
## Commands run        <bullet list or "- none">
## Test results        <command + pass/fail counts>
## Risk                <one-line residual risk or "none">
## Next recommendation <what a human should do next>
```

Idle cycles (no actionable task) do **not** write an outbox file; they report
`idle` to the console only.

---

## 6. Recovery behavior

### 6a. Crash recovery (orphaned `running` task)
The kernel processes one task per cycle and only one cycle runs at a time
(§7). Therefore, at the start of any cycle, **any** task already in
`status: running` is the residue of a crashed or interrupted prior cycle. RECOVER
runs before LOAD:

1. Find tasks with `status: running`.
2. For each, check git: did its `dispatch/<task-id>` branch get a commit, and was
   the file already archived? If forward progress is complete, finish the
   transition (→ `done`) and move to `archived/`.
3. Otherwise re-queue: `running → pending`, clear `locked_at`/`lock_owner`, leave
   in `queue/`. The next LOAD will pick it up cleanly.

### 6b. Stale-lock recovery
`isStaleLock(meta, now, ttl=1h)` (in `lib/dispatch.ts`) flags a `running` task as
stale when it has no `locked_at`, an unparseable `locked_at`, or a `locked_at`
older than the TTL. A stale lock is always safe to reclaim via §6a because the
single-cycle invariant guarantees no other live cycle owns it.

### 6c. Restart recovery
All state lives in the repo: `queue/`, `archived/`, `outbox/`, and git history.
A brand-new session with zero chat memory resumes correctly by reading these
files alone. The kernel never relies on conversation state.

### 6d. Cycle mutex (`.lock/`)
A cycle acquires a mutex by atomically creating the directory
`beactive-dispatch/.lock/` (mkdir is atomic on POSIX). If it already exists and
is fresh, the cycle aborts (another cycle is live). If it is older than the TTL,
it is stale and may be reclaimed. The mutex is removed on cycle exit (success or
failure). `.lock/` is git-ignored — it is ephemeral, machine-local runtime state.

---

## 7. Concurrency model (Phase 1)

**Single-writer.** Exactly one `/process-dispatch` cycle runs at a time, on one
machine, in one session. Guarantees:
- one task per cycle (`selectNextTask` returns a single winner),
- the `.lock/` mutex prevents two overlapping cycles,
- `running` + `locked_at` + `lock_owner` make any orphan detectable.

**Out of scope for Phase 1** (documented residual risk, see readiness report):
true multi-process/multi-machine concurrency. The `.lock/` mkdir-mutex is
correct for a single machine but is not a distributed lock. No daemon or watcher
exists yet, so the realistic concurrency exposure is "human runs the command
twice at once," which the mutex handles.

---

## 8. Naming conventions

### Branch
`dispatch/<task-id>` — one branch per task, created off the current integration
branch (or `master` in normal operation). Never commit dispatch work directly to
`master`.

### Commit
`<type>(<scope>): <description> (dispatch:<task-id>)`
- `type` ∈ `feat | fix | refactor | test | chore | docs`
- always suffixed with `(dispatch:<task-id>)` for traceability
- ends with the standard `Co-Authored-By` trailer.

**`commit:` field in the task/outbox frontmatter** records the **work commit**
made in STEP 8 (its sha is known before the audit artifacts are written, so there
is no self-reference). For **audit-only** tasks (no production change — the audit
artifacts are the whole deliverable), use the literal `self (audit-only)` rather
than a sha, because a self-referential sha goes stale on `--amend`. This closes
the Phase 1 D1 debt.

### Task id
Short kebab-case, unique across `queue/ ∪ archived/`. `findDuplicateIds` is the
machine check. A new attempt of failed work uses a **new** id, never a reused one.

### Outbox file
`<task-id>.<YYYYMMDDTHHMMSSZ>.md` (see §5).

---

## 9. Audit-trail behavior

- `queue/`, `archived/`, `outbox/` are git-tracked. Task files and outbox reports
  are `git add`-ed by the kernel so the audit trail self-enforces.
- Per-task artifacts (the archived task file + its outbox report) are committed on
  that task's `dispatch/<task-id>` branch and consolidate into `master` when the
  human merges. Until merge, the audit trail for in-flight work lives on its task
  branch — by design.
- The `Event`-table immutability rule of the main app does NOT apply here; these
  are filesystem artifacts, but the spirit is the same: archived/outbox files are
  append-only in practice — do not rewrite a completed task's history.

---

## 10. Hard safety gates (non-negotiable, Phase 1)

- No `git push`. No merge. No production deploy. (Human-only.)
- No work on `master` directly — always `dispatch/<task-id>`.
- Pause for explicit human approval before any destructive op: `prisma migrate`,
  deleting files/rows, removing dependencies, force-push.
- No Telegram, no daemon, no watcher, no background service in Phase 1.
- One task per cycle. Never merge two task files. Never skip VALIDATE.
- Repo + dispatch files + git history are the only sources of truth.
