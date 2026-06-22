# ENFORCEMENT_AUDIT.md — Is the Loop System Actually Enforceable?

> **Date:** 2026-06-21 · **Repo:** `arhamahmedq/BeActive` (public, default branch `master`)
> **Bottom line:** The quality system is **fully bypassable today.** It runs, it reports, it can block a *local* loop — but at the repository level there is **zero** enforcement. Nothing stops a red or unreviewed change from reaching `master`. This audit states exactly what is true and the exact settings to make the gate mandatory.

---

## Ground truth (measured via `gh`, not assumed)

| Probe | Result |
|---|---|
| `branches/master/protection` | **404 — "Branch not protected"** |
| `rulesets` | **`[]`** (none) |
| Merge types allowed | merge-commit ✅, squash ✅, rebase ✅ (all on) |
| `deleteBranchOnMerge` | false |
| Recent pushes to `master` | **direct pushes** (e.g. `style(streak)…`, `style(feed)…`) — no PR |
| CI workflow `CI` | runs on push + PR, last 5 runs green |
| New `quality-gate` job | **not yet pushed** — has never run on GitHub |
| Token scope | `repo` (can configure protection) · public repo (protection is free) |

---

## 1. Which protections are currently ACTIVE?
- **CI runs automatically** on every push and PR to `master` (the `CI` workflow). It executes and reports a pass/fail status.
- **Local ESLint edit-hook** (`.claude/hooks/eslint-on-edit.sh`) — blocks *during editing*, on this machine only.
- **Local quality scripts** (`quality:gate`, `review:route`, `review:aggregate`) — run on demand, locally.

That is the complete list. **All three are advisory or local. None gate the remote branch.**

## 2. Which protections EXIST but are UNENFORCED?
- **The new `quality-gate` CI job** — written in the working tree, **not committed/pushed**, so GitHub has never run it. The four-checks-in-one gate does not yet exist on the remote.
- **The review/findings/aggregate enforcement** — exists as scripts; CI does not yet require it (and `.quality/` is gitignored, so committed findings are rare — see `RISKS.md` R5).
- **CLAUDE.md policy** "feature branch → PR → merge, no direct push to `main`" — documented doctrine, contradicted by actual history (direct pushes to `master`).
- **CI being green** — computed on every push, but **not a required check**, so it gates nothing.

## 3. Which protections can be BYPASSED? (today: all of them)
With no branch protection and no rulesets:
- ✅ **Direct push to `master`** — allowed (and actively used). CI runs *after* the push; it cannot stop it.
- ✅ **Merge a PR with failing or zero checks** — nothing blocks it.
- ✅ **Merge without review** — no required approvals.
- ✅ **Force-push / delete `master`** — not blocked.
- ✅ **Skip the local gate** — `quality:gate` is opt-in; a developer can simply not run it.
- ✅ **Admin bypass** — no `enforce_admins`, so even if rules existed the owner would skip them.

**There is currently no path by which a bad change is *prevented* from reaching production.** CI is a smoke alarm, not a lock.

## 4. Exact GitHub repository settings to enable
**Settings → General → Pull Requests**
- ☑ Allow squash merging — **keep** (recommended primary).
- ☐ Allow merge commits — optional; disable for a linear history.
- ☐ Allow rebase merging — optional.
- ☑ **Automatically delete head branches** (currently off).

**Settings → Branches → Add branch ruleset** (or classic *Branch protection rule*) targeting `master` — see §5.

**Settings → Actions → General**
- Workflow permissions: **Read repository contents** (default) is enough; the CI job needs no write. Artifact upload works by default.

## 5. Exact branch protection rules for `master`
| Rule | Value | Why |
|---|---|---|
| Require a pull request before merging | **ON** | Ends direct-push-to-`master` — the #1 bypass. |
| → Required approvals | **0** (solo) / **1** (team) | Solo founders can't approve their own PR; 0 still requires a PR + green checks. |
| → Dismiss stale approvals | ON (team only) | Re-review after new commits. |
| Require status checks to pass | **ON** | The gate. |
| → Require branches up to date | **ON** (`strict`) | Checks ran against the latest `master`. |
| → Required check | **`Quality Gate (lint · typecheck · build · tests)`** | See §6. |
| Require conversation resolution | ON | No merging over open threads. |
| Require linear history | Optional ON | Cleaner history; pair with squash. |
| Block force pushes | **ON** | Protect history. |
| Block deletions | **ON** | Protect the branch. |
| Include administrators / "Do not allow bypass" | **ON** (recommended) | Without it the owner bypasses everything — the gate is theater. Accept the friction or document the exception. |

## 6. Required status check — the exact context
The required-check name is the **CI job's display name**, currently:

```
Quality Gate (lint · typecheck · build · tests)
```

**Critical ordering (chicken-and-egg):** GitHub only lets you mark a check "required" *after it has run at least once*. The new job is unpushed, so this context does **not exist on the remote yet**. You must **push the new `ci.yml`, let CI run once, then add the check**. Marking a non-existent context "required" deadlocks every merge.

> Recommendation: keep the job name stable. If you later rename the job, the old required-check context silently stops matching and the gate goes dark — re-select it after any rename.

## 7. Manual steps still required from the repository owner
These **cannot** be done from application code — they need repo-admin rights:
1. **Commit + push** the new `ci.yml` + `scripts/` so the `quality-gate` job runs on GitHub.
2. **Wait for one CI run** so the check context registers.
3. **Configure branch protection / ruleset** on `master` (UI or `gh api` — §guide).
4. **Decide merge + review policy** (solo vs. team approvals).
5. **Add any repo secrets** the `build` step needs (`NEXT_PUBLIC_*`, etc.) so the build check is real, not a false pass/fail.
6. (Optional, recommended) enable the deferred **pre-commit / Stop hard-gate hooks** so red is caught before it's even pushed.

---

## Step-by-step implementation guide → mandatory quality gate

Run in order. Steps 1–2 are code; 3–6 are repo-admin (owner).

### Step 1 — Land the enforcement code
```bash
git checkout -b ci/enforce-quality-gate
git add .github/workflows/ci.yml scripts/ package.json .gitignore docs/ CHANGELOG.md TODO.md RISKS.md DECISIONS.md .claude/
git commit -m "ci: single quality-gate job + review enforcement scripts"
git push -u origin ci/enforce-quality-gate
gh pr create --fill
```

### Step 2 — Let CI run once
Open the PR; confirm the **`Quality Gate (lint · typecheck · build · tests)`** check appears and finishes. If `build` fails for missing env, add the secrets (Step 5) and re-run. Merge the PR (still bypassable at this point — that's expected; protection comes next).

### Step 3 — Turn on branch protection (the lock)
After the check has run once on `master`:
```bash
gh api -X PUT repos/arhamahmedq/BeActive/branches/master/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Quality Gate (lint · typecheck · build · tests)"]
  },
  "enforce_admins": true,
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
(`required_approving_review_count: 0` = solo-founder mode: a PR + a green gate are required, but you can self-merge. Set to `1` once there's a second maintainer.)

### Step 4 — Verify the lock holds
```bash
gh api repos/arhamahmedq/BeActive/branches/master/protection --jq '.required_status_checks.contexts, .enforce_admins.enabled'
# Then prove it: a direct push to master must now be rejected.
git checkout master && git commit --allow-empty -m "test: should be blocked" && git push origin master   # expect: rejected
git reset --hard HEAD~1
```
Expected: the push is rejected (protected branch). If it succeeds, protection is misconfigured.

### Step 5 — Make the build check honest
In **Settings → Secrets and variables → Actions**, add any env the production build reads (`NEXT_PUBLIC_*`, etc.). Until then the `build` check may pass/fail for the wrong reason (`RISKS.md` R2).

### Step 6 — (Recommended) close the local bypass
Add the deferred hard-gate hooks (`TODO.md` P1) so red is blocked **before** push:
- **pre-commit** → `npm run quality:gate --quick`, block on red.
- **Stop hook** → block while `review-report.json` shows `blocked: true`.

### Definition of "truly mandatory"
All true at once:
- [ ] `branches/master/protection` returns 200 (not 404).
- [ ] Required context = `Quality Gate (lint · typecheck · build · tests)`, `strict: true`.
- [ ] `enforce_admins: true` (no owner bypass).
- [ ] Direct push to `master` is rejected.
- [ ] A PR with a failing gate **cannot** be merged.

Until every box is checked, the system is a strong *assistant*, not a *gate*. The code is ready; the lock is a repo-admin action only the owner can take.
