# ACTIVATION_PLAN.md — Turning On the Loop-Engineering Gate

> **Audience:** the repo owner (solo founder). **Repo:** `arhamahmedq/BeActive`, default `master`.
> **Goal:** activate the quality gate as a *mandatory* check **without ever locking yourself out of your own repo.**
> **Companion:** `docs/ENFORCEMENT_AUDIT.md` (the why). This file is the runbook (the how).

---

## Pre-flight verification (done — state at time of writing)

| Check | Result |
|---|---|
| All loop-system files committed? | ❌ **No — 25 uncommitted items.** Phase 1 commits them. |
| `ci.yml` valid + single `quality-gate` job? | ✅ Yes |
| Job name matches audit's required-check string? | ✅ **`Quality Gate (lint · typecheck · build · tests)`** — exact match |
| Local gate green? | ✅ `quality:gate --quick` = lint+typecheck+test pass; `build` unverified (see below) |
| Required secrets identified? | ✅ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` (build reads these) |
| Branch protection available? | ✅ Public repo + `repo` token scope; no billing blocker |

**The one real unknown: does `next build` pass in CI?** The build reads the three `NEXT_PUBLIC_*` vars above. If they're absent in CI the build job may fail (false red). Phase 1 proves this before any lock is applied — that ordering is the whole anti-lockout strategy.

> **Do NOT set `NEXT_PUBLIC_STREAK_DEBUG` in CI** — it's dev-only (CLAUDE.md §8); leave it unset.

---

## Phase 1 — Push & CI validation (no lock yet — fully reversible)

The gate must prove itself **green on a branch** before it can ever be required.

```bash
# 1. Branch (never push this straight to master)
git checkout -b ci/activate-quality-gate

# 2. Stage the loop system
git add .github/workflows/ci.yml scripts/ package.json .gitignore \
        docs/ CHANGELOG.md TODO.md RISKS.md DECISIONS.md \
        .claude/skills .claude/reviewers .claude/checklists .claude/workflows \
        app/web/eslint.config.mjs app/web/app/comment-lab/ConceptHuddle.tsx

# 3. Sanity: run the exact command CI will run, locally, first
npm run quality:gate            # includes build — must exit 0 before you rely on CI

git commit -m "ci: activate single quality-gate job + review enforcement scripts"
git push -u origin ci/activate-quality-gate
gh pr create --fill
```

**Validate on the PR:**
- The check **`Quality Gate (lint · typecheck · build · tests)`** appears and runs.
- If `build` fails → it's almost certainly missing `NEXT_PUBLIC_*` env → do **Phase 2 secrets first**, push an empty commit (`git commit --allow-empty -m "ci: rerun" && git push`), confirm green.
- **Do not proceed to Phase 3 until this check is green at least once.** A required check that has never gone green = guaranteed lockout.

✅ **Exit criteria:** PR shows the quality-gate check **green**. Merge the PR (squash). The check now exists on `master`'s history and is selectable as "required."

---

## Phase 2 — GitHub configuration (settings + secrets)

**Secrets/variables** — *Settings → Secrets and variables → Actions*. Add as **Variables** (these `NEXT_PUBLIC_*` values are publishable, not secret):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`  (e.g. your prod URL)

Then reference them in the `build` env of `ci.yml` if the build needs them (only if Phase 1 build failed without them).

**Repo settings** — *Settings → General → Pull Requests*:
- ☑ Automatically delete head branches (keeps the repo clean as you PR-per-change).
- Keep ☑ squash; merge-commit/rebase optional.

✅ **Exit criteria:** CI build is green *with* the configured env; branches auto-delete.

---

## Phase 3 — Branch protection activation (the lock — staged for safety)

**Solo-founder safe order: protect first with an admin escape hatch, tighten later.**

### 3a. Apply protection — `enforce_admins: FALSE` (you keep an escape hatch)
```bash
gh api -X PUT repos/arhamahmedq/BeActive/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Quality Gate (lint · typecheck · build · tests)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false
  },
  "required_linear_history": true,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON
```
Why this is the safe default for a solo founder:
- `required_approving_review_count: 0` — **you can self-merge** (you cannot approve your own PR, so any non-zero value would lock you out).
- `enforce_admins: false` — if CI breaks, **you (admin) can still merge a fix**. This is the escape hatch. The gate is mandatory for normal flow but you are not trapped.
- `allow_force_pushes/deletions: false` — protects history without affecting merges.

### 3b. (Later, once you trust it for ~1 week) tighten to fully mandatory
Re-run the same command with `"enforce_admins": true`. Now even you must go through a green PR. Only do this after Phase 4 passes and you've merged a few real PRs comfortably.

✅ **Exit criteria:** `gh api repos/arhamahmedq/BeActive/branches/master/protection` returns 200.

---

## Phase 4 — Verification tests (prove it works *and* that you're not locked out)

```bash
# T1 — required check is wired to the exact context
gh api repos/arhamahmedq/BeActive/branches/master/protection \
  --jq '.required_status_checks.contexts'        # → ["Quality Gate (lint · typecheck · build · tests)"]

# T2 — direct push to master is now rejected (PR required)
git checkout master && git pull
git commit --allow-empty -m "test: should be blocked"
git push origin master                            # EXPECT: rejected (protected branch)
git reset --hard HEAD~1

# T3 — a RED PR cannot be merged
git checkout -b test/red-gate
printf '\nexport const BREAK: number = "x"\n' >> shared/types/index.ts   # type error
git commit -am "test: intentional red" && git push -u origin test/red-gate
gh pr create --fill
# On the PR: the quality-gate check goes red → "Merge" is blocked. Confirm, then:
gh pr close test/red-gate --delete-branch
git checkout master

# T4 — a GREEN PR CAN be merged (normal flow still works for you)
#   (any trivial valid change → PR → check green → merge succeeds)

# T5 — escape hatch intact (only while enforce_admins=false): you can still merge your own green PR.
```

✅ **Exit criteria:** T1 exact-match, T2 rejected, T3 merge-blocked, T4 merge-allowed.
**If T2 lets the push through or T1 shows a different/empty context → STOP and go to Phase 5; the check name is wrong and would lock you out when tightened.**

---

## Phase 5 — Rollback procedure (instant un-lock — keep this handy)

You always retain admin, so you can never be permanently locked out. To recover:

```bash
# FULL UNLOCK — remove all protection immediately (nuclear, instant)
gh api -X DELETE repos/arhamahmedq/BeActive/branches/master/protection

# SOFT UNLOCK — drop only admin enforcement so you can merge a hotfix, keep the rest
gh api -X PUT repos/arhamahmedq/BeActive/branches/master/protection --input - <<'JSON'
{ "required_status_checks": {"strict": true,
    "contexts": ["Quality Gate (lint · typecheck · build · tests)"]},
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null }
JSON

# DISABLE THE GATE TEMPORARILY — keep protection, stop requiring the check
gh api -X PUT repos/arhamahmedq/BeActive/branches/master/protection --input - <<'JSON'
{ "required_status_checks": null, "enforce_admins": false,
  "required_pull_request_reviews": {"required_approving_review_count": 0},
  "restrictions": null }
JSON
```

**Common lock scenarios & the fix:**
| Symptom | Cause | Fix |
|---|---|---|
| No PR can merge; check "Expected — Waiting" forever | required context name ≠ actual job name | Soft-unlock, re-add the **exact** context from a real run |
| Can't merge your own PR | `required_approving_review_count ≥ 1` on a solo repo | re-PUT with `0` |
| Can't merge the fix for broken CI | `enforce_admins: true` + red CI | Soft-unlock (admin), merge fix, re-tighten |
| Stuck on "branch out of date" | `strict: true` | rebase/update branch, or drop `strict` |

---

## TL;DR sequence
1. **Push on a branch → PR → confirm the gate check is GREEN** (never require an unproven check).
2. Add the 3 `NEXT_PUBLIC_*` build vars.
3. Protect `master` with `enforce_admins: false`, `reviews: 0` (escape hatch + self-merge).
4. Run T1–T4 to prove the lock works and you're not trapped.
5. Keep the Phase 5 unlock commands bookmarked. Tighten to `enforce_admins: true` only after a comfortable week.
