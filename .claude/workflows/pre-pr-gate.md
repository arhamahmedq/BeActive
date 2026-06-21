# Workflow — Pre-PR Gate (executable, local twin of CI)

Run before committing / opening a PR so red never reaches GitHub.

## One command
```bash
npm run quality:gate    # lint · typecheck · build · test → .quality/quality-report.md, exit 1 on any failure
```
This is the **exact command CI runs** (`.github/workflows/ci.yml`). Green locally ⇒ CI's `quality-gate` job is green. No drift by construction.

## Full sequence (stop at the first red)
1. `npm run quality:gate` — must exit 0. (`--quick` skips build for fast iterations; the **final** gate must include build.)
2. `npm run review:aggregate` — must report `blocked: false` (zero critical findings). Run the review loop first (`review-loop.md`) if you haven't produced findings.
3. **Migration safety** — if `prisma/schema.prisma` changed: a migration exists, and remember `prisma migrate deploy` is manual/out-of-band (`CLAUDE.md §18` — Vercel can't run it).
4. **Docs synced** — doc-sync matrix satisfied for the touched files.

Any red → fix and re-run from the failed step. **Never open a PR on a red gate.**
