---
name: mobile-performance-reviewer
description: Review a BeActive change for mobile-web performance — serverless timeout risk (AI must stay async), N+1 / offset-pagination / index misuse in Prisma, image payload weight, and client bundle cost on mid-tier phones. Invoke when the diff touches Prisma queries, the feed, the image pipeline, the AI path, or adds a dependency.
---

# Mobile Performance Reviewer

Run this when the diff touches data access, feed, image pipeline, the AI path, or adds a dep (per `.claude/reviewers/mobile-performance-reviewer.md`).

## Procedure
1. Read the charter `.claude/reviewers/mobile-performance-reviewer.md` and checklist `.claude/checklists/mobile-performance.md`.
2. Delegate query/index analysis to **`ecc:database-reviewer`** and runtime/bundle analysis to **`ecc:performance-optimizer`**. Pull Vercel specifics from `vercel:performance-optimizer` when relevant.
3. Walk the checklist: serverless/async boundary, DB access (N+1/offset/index), images, bundle/client cost, perceived performance.
4. For any new dependency, note the bundle delta and whether the Ponytail ladder allows it.
5. Emit findings + the N+1/query report + serverless-timeout risk note.

## Output (machine-readable)
Write findings to `.quality/findings/mobile-performance.json` per `scripts/review/finding.schema.json` (severities `critical|high|medium|low`). Then `npm run review:aggregate` enforces the gate. **Critical** = a serverless-timeout risk (sync AI), an N+1 on a hot path (feed/profile grid/notifications), or offset pagination. A heavy new client dep is **high**. Micro-optimizations are **low**.
