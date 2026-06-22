# Workflow — Review Loop (executable)

The autonomous review loop. **Deterministic steps are scripts with exit codes; judgment steps are the reviewer skills writing structured JSON the scripts enforce.** That boundary is the whole design.

```
implement → quality:gate → review:route → run reviewers → review:aggregate → fix → re-review → complete
```

## Steps
1. **Build** — make the change.
2. **Quality gate** — `npm run quality:gate` (`--quick` skips the slow build mid-iteration). Red → fix → repeat. (gates G0–G2; mirrored by CI G4)
3. **Route** — `npm run review:route` → `.quality/review-plan.json`. Deterministic: which reviewer skills apply and why (conditional fan-out; `security`+`qa` always on a code change).
4. **Review** — for each reviewer in the plan, invoke its skill (e.g. `Skill(security-reviewer)`). Each reads its charter + checklist, delegates to its backing ECC agent, and **writes `.quality/findings/<id>.json`** per `scripts/review/finding.schema.json`. The UI reviewer gathers Playwright-MCP browser evidence first (REVIEW_PROCESS.md §browser).
5. **Aggregate** — `npm run review:aggregate`. Exits 1 on any **critical** (or schema error) → BLOCKED. Writes `.quality/review-report.{json,md}`.
6. **Fix loop** — if blocked: fix the criticals, refresh the affected findings file(s), re-run step 5. Cap at 3 iterations; if still blocked, surface to the user with the remaining findings — never proceed silently.
7. **Docs** — sync per `CLAUDE.md §18`.
8. **Complete** — `quality:gate` exit 0 **and** `review-report.json` shows `"blocked": false`.

## One-shot
```bash
npm run review:route && echo "now run the listed reviewer skills, then:" && npm run review:aggregate && npm run quality:gate
```
Exit 0 from both `review:aggregate` and `quality:gate` is the machine definition of "done".
