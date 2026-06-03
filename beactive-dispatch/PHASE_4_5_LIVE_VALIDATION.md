# Phase 4.5 — Live Validation Plan & Checklist

**Goal:** Prove the full chain end-to-end before pushing Phases 1–4:

```
Telegram → Transport(adapter) → enqueue() → queue/ → /process-dispatch → worker → output(outbox)
```

**Two layers of validation:**
- **Part A — Local pre-flight** (no bot/network needed): drive the REAL adapter +
  REAL `enqueue` with the simulator and the kernel. I can run all of this.
- **Part B — True live** (needs your `@BotFather` token + network + the running
  bot): only the literal Telegram getUpdates/sendMessage hop. You run this.

**Simulator** (Part A tool): `beactive-dispatch/transport/telegram.simulate.ts`
```bash
SIM_ALLOWED_CHAT_IDS=42 SIM_MESSAGE_ID=1 \
SIM_QUEUE_DIR=/tmp/scratch/queue SIM_ARCHIVED_DIR=/tmp/scratch/archived \
  npx tsx beactive-dispatch/transport/telegram.simulate.ts "<message>" 42
# exit 0 = queued (✅) · 2 = enqueue rejected (⚠️ e.g. duplicate) · 3 = rejected pre-enqueue (empty/unauthorized)
```

**Bot** (Part B): `npx tsx beactive-dispatch/transport/telegram.bot.ts`
(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS` set; allowlist is fail-closed.)

---

## Validation matrix

| # | Path | Part A (simulator) | Part B (real bot) | Pre-flight result |
|---|------|--------------------|--------------------|-------------------|
| 1 | Happy | ✅ | ⬜ | **PASS** (exit 0, file `…-c<chat>-m<id>.md`, status pending) |
| 2 | Duplicate / redelivery | ✅ | ⬜ | **PASS** (same message_id ⇒ 2nd dedup'd by enqueue, 1 survivor) |
| 3 | Malformed input | ✅ | ⬜ | **PASS** (empty/whitespace ⇒ rejected pre-enqueue, no file) |
| 4 | Unauthorized chat | ✅ | ⬜ | **PASS** (chat ∉ allowlist ⇒ rejected, no file) |
| 5 | Restart / recovery | ✅ | ⬜ | **PASS** (kernel RECOVER reclaims orphaned `running`; tests + Phase 1 smoke) |
| 6 | Queue persistence | ✅ | ⬜ | **PASS** (real files on disk survive a fresh process; re-read deterministically) |
| E2E | Telegram-origin task through `/process-dispatch` | ✅ | ⬜ | see capstone run below |

⬜ = you complete in Part B with the live bot.

---

## PATH 1 — Happy path

**Objective:** A Telegram message becomes a `pending` task file in `queue/`.

**Part A procedure**
1. `SIM_ALLOWED_CHAT_IDS=42 SIM_MESSAGE_ID=1 SIM_QUEUE_DIR=… SIM_ARCHIVED_DIR=… npx tsx …/telegram.simulate.ts "Add a logout button #high" 42`
2. Expect: stdout reply `✅ Queued task …`, exit `0`.
3. Expect: one file `add-a-logout-button-c42-m1.md` in the queue dir with
   `status: pending`, `source: telegram`, `priority: high`, sender in `notes`.

**Part B procedure (live bot)**
- [ ] Start the bot with your token + your chat id allowlisted.
- [ ] Send `Add a logout button #high` to the bot.
- [ ] Receive `✅ Queued task <id>`.
- [ ] Confirm `beactive-dispatch/queue/<id>.md` exists with `status: pending`, `source: telegram`.

**Pass criteria:** reply is ✅, exactly one new pending task file, correct frontmatter.

---

## PATH 2 — Duplicate / redelivery path

**Objective:** A redelivered Telegram update (Telegram is at-least-once) does NOT
create a second task. Duplicate detection stays in `enqueue()`; the transport just
derives a stable id from `chat_id + message_id`.

**Part A procedure**
1. Send with `SIM_MESSAGE_ID=7` twice (same text, same id).
2. Expect: 1st → `✅` exit `0`; 2nd → `⚠️ Could not queue … duplicate task id` exit `2`.
3. Expect: exactly one file for that message id.

**Part B procedure (live bot)**
- [ ] Send a message; note the `✅ <id>`.
- [ ] Force a redelivery: stop the bot mid-batch / restart it so the same update is re-polled
      (or re-send is NOT the same — true redelivery requires the same `message_id`).
- [ ] Confirm no second task file with the same id appears.

**Pass criteria:** distinct messages → distinct tasks; same `message_id` → exactly one task.

---

## PATH 3 — Malformed input path

**Objective:** Junk/empty input never produces a task and never crashes.

**Part A procedure**
1. Send `"   "` (whitespace) → reply `Send a task description…`, exit `3`, no file.
2. Send symbol-only `"!!!@@@"` → adapter slugs to `task-…`; `enqueue` validates the
   constructed task (still valid) → ✅. (Symbols are shaped, not rejected — by design.)

**Part B procedure (live bot)**
- [ ] Send an empty/whitespace message → friendly prompt, no task created.
- [ ] Send a very long message (>2000 chars) → body is capped; one bounded task file.

**Pass criteria:** empty ⇒ no file + prompt; oversized ⇒ capped body; never a crash or partial write.

---

## PATH 4 — Unauthorized chat path

**Objective:** Only allowlisted chats can enqueue; fail-closed.

**Part A procedure**
1. With `SIM_ALLOWED_CHAT_IDS=42`, send from chat `999` → `⛔ Not authorized`, exit `3`, no file.
2. With `SIM_ALLOWED_CHAT_IDS=` (empty), send from chat `42` → rejected (fail-closed).

**Part B procedure (live bot)**
- [ ] From an allowlisted chat: task is queued.
- [ ] From a non-allowlisted chat (e.g., a friend's): `⛔ Not authorized`, no task.
- [ ] Start the bot with `TELEGRAM_ALLOWED_CHAT_IDS` unset → it warns fail-closed; all messages rejected.

**Pass criteria:** unauthorized never reaches `enqueue`; empty allowlist rejects everyone.

---

## PATH 5 — Restart / recovery path

**Objective:** No task is ever lost or permanently stuck across a crash.

**Procedure**
1. Enqueue a task. Begin a `/process-dispatch` cycle that sets it `running`
   (`locked_at`/`lock_owner` stamped), then simulate a crash (abort before FINALIZE).
2. Start a fresh `/process-dispatch`. RECOVER must reclaim the orphaned `running`
   task (CONTRACT §6): finish-forward if its branch holds the commit, else re-queue
   to `pending`. The stale `.lock` is reclaimed.
3. Bot-level: kill the bot mid-poll, restart it. Telegram redelivers unconfirmed
   updates; idempotent ids (Path 2) make reprocessing safe.

**Pass criteria:** orphaned `running` task is reclaimed (never stuck); bot restart
causes no duplicate tasks; `npm run test` recovery cases (`isStaleLock`,
`selectNextTask` running-precedence) green.

---

## PATH 6 — Queue persistence validation

**Objective:** Queued tasks are durable on disk and survive process restarts.

**Procedure**
1. Enqueue N tasks. Confirm N `.md` files exist under `queue/` (git-tracked).
2. Exit every process. Start a fresh shell. Confirm the N files are still present
   and parse correctly (`parseTaskFile` / a fresh `/process-dispatch` LOAD).
3. Confirm `git status` shows the new task files (auditable trail).

**Pass criteria:** all queued tasks persist byte-for-byte across restarts; no
in-memory-only state; a cold session resumes from files alone.

---

## Exit criteria for Phase 4.5

- Part A: all 6 paths + the E2E capstone PASS (I run these).
- Part B: all `⬜` boxes checked against the live bot (you run these).
- Full suite green; transport typecheck clean.

Only when Part A **and** Part B are green is a push of Phases 1–4 recommended.
