# RISKS — Loop-Engineering System

Honest accounting of where the enforcement is real vs. where it still relies on trust.

| # | Risk | Severity | Mitigation / status |
|---|---|---|---|
| R1 | **CI not yet required** — `quality-gate` runs but branch protection isn't asserted, so a red CI can still be merged. | High | TODO P0: enable required check (repo admin). |
| R2 | **CI `build` unverified** — `npm run build` may fail in CI without real env; the build gate is unproven until a CI run is observed. | High | TODO P0: run CI, add secrets if needed. Documented in `ci.yml`. |
| R3 | **Reviewer judgment is LLM, not deterministic.** The tooling enforces routing + structure + severity-gating, but *whether* a real vuln is caught and labeled `critical` depends on the model. A missed issue = no finding = no block. | High | The scripts can't fix this. Mitigate with the ECC backing agents + checklists; treat reviewers as a strong aid, not a proof. |
| R4 | **Findings are self-reported.** A reviewer could under-rate severity to avoid blocking. Nothing cross-checks severity. | Medium | Schema + aggregator enforce *structure*, not *honesty*. Spot-check in self-critique; keep checklists explicit about what is critical. |
| R5 | **`.quality/` is gitignored** — CI's `review:aggregate` sees no findings unless committed, so the review gate is primarily a *local/Claude-time* gate, not a CI hard stop. | Medium | By design (findings are per-change). The deterministic 4 checks are the CI hard stop. Revisit if review evidence must persist in CI. |
| R6 | **Migrations still manual** — Vercel can't run `migrate deploy`; drift caused the 2026-06-13 outage and is not yet CI-guarded. | High | TODO P1: migration-drift guard. Documented in `CLAUDE.md §18`. |
| R7 | **Lab scratch lint** — fixed the one error in `comment-lab`, but future lab files can re-redden local lint (they're uncommitted, so CI is unaffected). | Low | Fix-source-not-config policy (config-protection hook enforces it). |
| R8 | **No pre-commit/Stop hard gate yet** — red code can still be committed locally; only CI + discipline catch it. | Medium | TODO P1: pre-commit + Stop hooks. |
