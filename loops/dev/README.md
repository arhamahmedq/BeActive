# loops/dev — Feature Build Loop

**Goal:** Take a spec or fix from intent to merged-and-deployed, production-grade, through the enforced gate. This is the OUTER task loop in `docs/LOOP_ENGINEERING.md`.

## Workflow

1. **Spec** — fill the feature template (`CLAUDE.md §12` / `docs/agent_runbook.md §4`). Confirm slice scope in `docs/goals.md`.
2. **Check** the source-of-truth docs: `data_model.md`, `STATE_MACHINE_REGISTRY.md`, `EVENT_CATALOG.md`, `API_CONTRACTS.md`.
3. **Branch** off `master` (never edit `master` directly).
4. **Build** — middle loop = `eslint-on-edit.sh` hook on every edit; inner loop = scoped tests to green.
5. **Review** — hand the diff to `loops/review` (see its contract).
6. **Gate** — `npm run quality:gate` (lint · typecheck · build · tests) must exit 0.
7. **Docs sync** — update the ledgers touched (`CHANGELOG.md`, and `TODO.md`/`RISKS.md`/`DECISIONS.md` if relevant) and any `docs/` the change invalidates.
8. **PR → green CI → squash-merge** → Vercel auto-deploys `master` to production.
9. **Log** — append one line to `loops/logs.md`.

## Boundaries

- Obey `CLAUDE.md §6` (WHAT TO AVOID) and `§13` (module communication) without exception.
- AI is classifier-only — no DB writes, no transition authority (`docs/AI_BOUNDARY.md`).
- Migrations are manual; run `prisma migrate deploy` out-of-band after a schema change (`CLAUDE.md §18`).
- Ponytail: climb the ladder — reuse before building, shortest working diff wins.

## Backlog

→ `TODO.md` (root). P0 items there are the live queue. Risks → `RISKS.md`.

## Timeline (recent)

→ `loops/logs.md` (filter `dev:`). Latest: P0 comment-focus fix shipped (PR #47, `5f479f00`), Glass House sheet (PR #46).
