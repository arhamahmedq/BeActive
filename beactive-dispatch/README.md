# beactive-dispatch — Autonomous Dispatch Queue

This folder is the **process queue** for the BeActive AI Dev OS loop.
It is the single source of truth for remote/async tasks. The repo is memory;
this folder is the runtime queue; git history is the audit log.

> **Trigger model (locked):** Native `/loop`. There is **no** out-of-process
> file watcher. The loop only runs while a `claude` session is alive on the
> machine and `/loop` is active. Telegram is an *interrupt into a live session*,
> not an out-of-band file writer. Do not assume a daemon exists.

> **Safety gate (locked):** The loop may edit code, run tests, and `git commit`
> on a feature branch. It **never** `git push`. It **pauses for human
> confirmation** before any destructive op (DB migration, file/row deletion,
> dependency removal, history rewrite). See §6.

---

## 1. Layout

```
beactive-dispatch/
├── README.md            ← this file — THE protocol (STEP 0–9, source of truth)
├── CONTRACT.md          ← formal lifecycle + recovery contract
├── task.template.md     ← copy this to create a task
├── lib/
│   └── dispatch.ts      ← pure, tested core: state machine + selection + stale-lock
├── queue/               ← pending/running tasks (git-tracked)
│   └── .gitkeep
├── archived/            ← terminal tasks: done/failed/blocked (git-tracked)
│   └── .gitkeep
├── outbox/              ← per-cycle execution reports (git-tracked output contract)
│   └── .gitkeep
└── .lock/               ← ephemeral cycle mutex (git-IGNORED, created at runtime)
```

A task is one `.md` file in `queue/`. One file = one atomic unit of work.
Never mix two task files into a single execution unit. See **CONTRACT.md** for
the formal state machine, outbox/output contract, and crash/stale-lock recovery.

---

## 1a. System boundary — the enqueue rule (Phase 3)

```
   External Inputs  (Telegram · API · Mobile UI · Web dashboard · CLI)
          │
          ▼
       enqueue()          ← the ONLY approved writer of new task files
          │                  (beactive-dispatch/lib/enqueue.ts)
          ▼
        queue/            ← new tasks land here, always status: pending
          │
          ▼
    /process-dispatch     ← the ONLY mutator of task state
   (pending → running → done|failed → archived, outbox)
```

**Single-writer invariant — permanently enforced:**

- External systems **MAY create** tasks — but only by calling `enqueue()`.
- External systems **MAY NOT mutate** task state. Ever.
- `enqueue()` **only creates** new files; it never reads-to-edit, moves, or
  deletes an existing task. It fails fast on a duplicate id (no overwrite, no
  merge). It validates, generates `created_at`, forces `status: pending`, and
  rejects any attempt to create a `running`/`done`/`failed` task.
- `/process-dispatch` (the kernel) is the **sole** owner of every state
  transition and of `archived/` + `outbox/`.

**This is a rule for all future phases, stated explicitly:**

> Future Telegram integration **MUST** call `enqueue()`.
> Future API endpoints **MUST** call `enqueue()`.
> Future dashboards / mobile / CLI **MUST** call `enqueue()`.
> **Nothing writes directly into `queue/` except `enqueue()`.**

`enqueue()` returns a deterministic result — `{ ok: true, id, path }` or
`{ ok: false, errors }` — never a silent or partial write. Validation/build logic
is the pure, tested `buildTaskFile()` in `lib/dispatch.ts`.

---

## 2. Task file format

Frontmatter is required. Body is free-form task description.

```markdown
---
id: <short-slug>            # stable id, e.g. feed-empty-copy
source: telegram | cli
status: pending | running | done | failed | blocked
priority: high | medium | low
model_effort: low | medium | high
created_at: <ISO-8601>
slice: <slice number or "none">   # which goals.md slice this belongs to
---

<Plain-language description of what to do and the definition of done.>
```

The loop appends these on completion:

```markdown
status: done                # or failed / blocked
completed_at: <ISO-8601>
branch: <git branch name>
commit: <short sha or "none">
summary: <one-line result>
```

---

## 3. Execution cycle (STEP 1–7)

Run by `/process-dispatch` (one cycle) or `/loop <interval> /process-dispatch`
(autonomous). Each invocation processes **exactly one** task, then stops.

**STEP 1 — LOAD**
- Read every `*.md` in `queue/`. Ignore any whose `status` ≠ `pending`.
- Sort: `priority` (high→low), then `created_at` (oldest first).
- Pick the single top task. If none → go IDLE (§5).
- Set its `status: running` and write the file before doing anything else
  (this is the lock; a second concurrent run skips a `running` task).

**STEP 2 — CONTEXT INJECTION**
- Read CLAUDE.md + the relevant `/docs` files for the task's `slice`.
- Identify the module boundary. Confirm architecture invariants:
  `controller → service → repo`, no cross-module repo imports, Prisma schema
  integrity, events emitted on state change.

**STEP 3 — PLAN (no code yet)**
- Decompose into the smallest correct set of steps.
- List risks + which tests are impacted.
- Confirm scope stays inside the task's slice. If the task *requires* crossing
  a slice boundary and didn't explicitly authorize it → mark `status: blocked`,
  write `summary:` explaining why, archive, and report. Do not guess.

**STEP 4 — EXECUTE**
- Implement minimal, surgical diffs. Do not refactor unrelated code.
- Follow TDD where a behavior is being added (test first), per project norms.

**STEP 5 — VALIDATE**
- Run the relevant tests (`npm run test`, and `npm run lint` / `type-check` if
  code changed). Fix failures before proceeding. No green tests → no commit.

**STEP 6 — COMMIT (local only)**
- If not already on a feature branch, create one: `dispatch/<task-id>`.
- Commit with: `feat|fix|refactor(scope): description (dispatch:<task-id>)`.
- **Never push.** Leave the branch local for human review.
- Pause for confirmation before destructive ops (§6).

**STEP 7 — FINALIZE**
- Update the task frontmatter (`status: done`, `completed_at`, `branch`,
  `commit`, `summary`). Move the file to `archived/`.
- Emit the observability report (§7).

---

## 4. Priority / order model

Execution order when idle and the queue is non-empty:
1. Any task already `status: running` (resume/verify first — could be a crash).
2. `pending` tasks, sorted by priority then `created_at` (FIFO within a tier).

CLI interactive work always preempts the queue: if the human is mid-task in the
session, finish that first, then drain the queue.

---

## 5. Idle behavior

When `queue/` has no `pending`/`running` task: **do not** claim the system is
"done." Report `NEXT TRIGGER STATE: idle`, stop the cycle, and (under `/loop`)
wait for the next interval. State lives in the repo + dispatch files, never in
chat memory — a fresh session can resume from these files alone.

---

## 6. Safety constraints (non-negotiable)

- Never push to any remote. Commits stay local on `dispatch/<task-id>` branches.
- Never act on `main`/`master` directly — always a feature branch.
- Pause and ask a human before: `prisma migrate`, deleting files or DB rows,
  removing dependencies, `git push`/force-push, or anything irreversible.
- Never execute a partial task. Never merge two task files into one unit.
- Never skip STEP 5 validation.
- Only act on tasks from an allowlisted source (Telegram access is gated by the
  telegram access skill — a task file is not authorization on its own).
- Repo + dispatch files + git history are the only sources of truth.

---

## 7. Observability report (required after every cycle)

```
TASK:        <id> (<priority>, slice <n>)
STATUS:      done | failed | blocked | idle
FILES:       <list of changed paths, or "none">
TESTS:       <command + pass/fail counts>
RISK:        <one-line residual risk, or "none">
NEXT STATE:  idle | continuing-queue (<N> pending remain)
```

---

## 8. How to run it

```bash
# One cycle (process the single top task, then stop):
/process-dispatch

# Autonomous: poll every 15 min and drain the queue one task per tick:
/loop 15m /process-dispatch

# Self-paced (model decides cadence):
/loop /process-dispatch
```

To enqueue from Telegram: send the task to your live `claude` session; it will
write a properly-formatted file into `queue/` (it does **not** appear by magic —
a session has to be open to receive the Telegram interrupt and write the file).
