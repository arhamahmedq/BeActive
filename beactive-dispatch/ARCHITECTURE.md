# Dispatch System — Architecture Overview

Single-page map of the BeActive AI Dev OS dispatch system. Read this first; the
formal rules live in `CONTRACT.md`, the protocol in `README.md`, and the
mechanics in `lib/dispatch.ts` (pure, tested). This doc matches the
implementation as of Phases 1–4.5.

```
External Inputs (Telegram · API · UI · CLI)
        │  create-only, via the boundary
        ▼
   enqueue()  ── lib/enqueue.ts ── the ONLY writer of new task files
        │
        ▼
     queue/   ── *.md, status: pending (git-tracked, durable)
        │
        ▼
 /process-dispatch  ── .claude/commands/process-dispatch.md ── the ONLY mutator
   (STEP 0–9: lock → recover → load → lock → … → validate → commit → outbox)
        │
        ├──► archived/  (terminal task files: done | failed | blocked)
        └──► outbox/<task-id>.md  (execution report — the output contract)
```

## 1. Kernel ownership boundaries
The kernel (`/process-dispatch`) is the **sole** mutator of task state. It alone
performs `pending → running → done|failed|blocked`, writes `archived/` and
`outbox/`, and creates `dispatch/<task-id>` branches + local commits. It never
pushes, merges, or deploys, and pauses for human approval before destructive ops
(CONTRACT §10). Nothing else may transition a task.

## 2. enqueue() contract  (`lib/enqueue.ts` + `buildTaskFile` in `lib/dispatch.ts`)
The single approved entry point for **creating** tasks. It:
- validates the input contract (`validateEnqueueInput`: requires `id`, `source`,
  `priority`, `model_effort`; rejects any `status` other than `pending`);
- generates `created_at`, forces `status: pending`, defaults `slice`;
- enforces a safe id (`TASK_ID_RE` = `^[a-z0-9][a-z0-9-]*$`, blocks path traversal);
- writes atomically (temp → `linkSync` create-if-absent; rolls back on failure);
- returns a deterministic `{ ok: true, id, path } | { ok: false, errors }` — never
  a silent or partial write. It never mutates an existing task.

## 3. Dispatch flow
External input → `enqueue()` → `queue/<id>.md` (pending) → `/process-dispatch`
selects one task (`selectNextTask`: priority → created_at → id), executes it
under TDD + a mandatory `npm run test` gate, commits locally on a per-task branch,
then archives the task and writes its outbox report. One task per cycle.

## 4. Telegram transport responsibilities  (`transport/telegram.adapter.ts`, `transport/telegram.bot.ts`)
A **thin caller** of `enqueue()` with zero task-state semantics. The adapter is
pure: it maps a message → `EnqueueInput`, calls the injected `enqueue`, and
formats the reply. It owns only transport/security concerns — a fail-closed chat
allowlist and a body-length cap — never task validation, duplicate detection,
file writes, or state changes. The bot runner is the only networked piece
(dependency-free long-poll). Adding a new source = a new adapter, never a new
writer.

## 5. Recovery behavior  (CONTRACT §6; `isStaleLock`, RECOVER step)
All state lives in the repo, so a cold session resumes from files alone. At each
cycle start, any task still `running` is an orphan of a crashed prior cycle; the
kernel reclaims it — finish-forward if its branch holds the commit, else re-queue
to `pending`. A stale `.lock/` mutex (atomic mkdir; git-ignored) is reclaimed by
age. No task ever becomes permanently stuck.

## 6. Duplicate protection behavior
Two layers, both ultimately resolved by `enqueue`:
- **id collision:** `enqueue` fails fast on any `id` already present in
  `queue/ ∪ archived/`, and the atomic `linkSync` cannot overwrite even under a
  same-id race. No overwrite, no merge.
- **Telegram redelivery (at-least-once):** the adapter derives the id from
  `chat_id + message_id`, so a redelivered update maps to the *same* id and
  `enqueue` dedupes it. Distinct messages (distinct `message_id`) → distinct
  tasks. The transport adds no dedup logic of its own.

## 7. Queue persistence model
Tasks are plain `.md` files on disk under `queue/` (and `archived/`, `outbox/`),
all git-tracked for a durable audit trail. There is no in-memory-only state:
queued tasks survive process restarts and are re-read deterministically by
`parseTaskFile`. The `.lock/` mutex is the only ephemeral, git-ignored artifact.

---

**Component index:** `README.md` (protocol §0–9, transport §1a) · `CONTRACT.md`
(formal lifecycle/recovery/outbox) · `lib/dispatch.ts` (pure core) ·
`lib/enqueue.ts` (boundary writer) · `transport/telegram.{adapter,bot,simulate}.ts`
· `.claude/commands/process-dispatch.md` (kernel) ·
`PHASE_4_5_LIVE_VALIDATION.md` (live checklist). Tests:
`tests/unit/dispatch/*`, `tests/integration/telegram-enqueue.test.ts`.
