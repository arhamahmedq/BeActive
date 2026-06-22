# loops/ — BeActive Autonomous Loop Harness

> **Entry point for any agent running a loop on this repo.** Read this, then `logs.md`, then your domain's `README.md`. This harness *adapts* the generic loop-engineering framework (`docs/loopeng_instructions.md`) to BeActive — it does not duplicate the project's source-of-truth docs, it points at them.

## Read order (every iteration)

1. **`loops/logs.md`** — last 5–10 global entries (cross-domain work clock / state).
2. **`loops/<domain>/README.md`** — your loop contract (goal, workflow, boundaries, backlog, timeline).
3. **`docs/context.md`** — business rules & strategy (the framework's `context.md`).
4. **`docs/architecture.md`** — system architecture (the framework's `architecture.md`; **wins all contradictions** per `CLAUDE.md §16`).
5. Domain-specific source of truth (see each contract).

After a meaningful chunk of work: **append one line to `loops/logs.md`** (see its format).

## The three real loops

This product has three loops that actually run. The framework's `support`/`content` domains are intentionally **absent** — there is no support inbox or content pipeline on a solo pre-MVP build (YAGNI). Add a domain folder only when its loop genuinely starts running.

| Domain | What it does | Contract |
|---|---|---|
| **dev** | Build a feature/fix end-to-end through the gate | [`dev/README.md`](dev/README.md) |
| **review** | 5-reviewer pass on a diff → findings → block/pass | [`review/README.md`](review/README.md) |
| **design** | UI/UX overhaul backlog → ship visual improvements | [`design/README.md`](design/README.md) |

## Framework → repo mapping (nothing is reinvented)

| Framework concept | Lives in this repo as |
|---|---|
| `context.md` | `docs/context.md` |
| `architecture.md` | `docs/architecture.md` (+ `docs/LOOP_ENGINEERING.md` for the loop system itself) |
| Global `logs.md` work clock | `loops/logs.md` *(new — the one genuinely missing piece)* |
| Loop contracts (per-domain README) | `loops/<domain>/README.md` *(new)* + the `.claude/reviewers/*` charters for the review domain |
| Artifact: **signals** (frictions, bugs, risks) | `RISKS.md`, Sentry, `UI feedback/` |
| Artifact: **tasks** (work items) | `TODO.md` |
| Artifact: **tickets** | GitHub Issues/PRs (`gh`) |
| Artifact: **docs** | `docs/` |
| Decisions ledger | `DECISIONS.md` · change ledger → `CHANGELOG.md` |
| Skills/tools per domain | `.claude/skills/*`, `.claude/checklists/*`, `scripts/` (`quality:gate`, `review:route`, `review:aggregate`), MCP (`playwright`, `github`, `vercel`, `context7`) |
| Loop trigger / scheduler | CI gate (`.github/workflows/ci.yml`, **required** on `master`) + branch protection. See `docs/FINAL_ACTIVATION_STATUS.md`. |

## Boundaries (apply to every loop)

- `docs/architecture.md` > `docs/data_model.md` > `docs/API_CONTRACTS.md` > this file.
- Never push to `master` directly — feature branch → PR → green `Quality Gate` → squash-merge (auto-deploys to Vercel). See `docs/FINAL_ACTIVATION_STATUS.md`.
- Migrations are **manual** (`CLAUDE.md §18`). Vercel cannot run them.
- All the "WHAT TO AVOID" rules in `CLAUDE.md §6` are in force.

## Health check

- `loops/logs.md` should gain an entry per work session — stale = drift.
- Quarterly: re-run this audit (`docs/loopeng_instructions.md`) to catch structure drift.
