---
name: ui-reviewer
description: Review a BeActive UI change for consumer-grade quality, design-system fidelity (brand green, no SaaS look), mobile-first layout, accessibility basics, and live render integrity (no console errors). Invoke when the diff touches components, pages, styles, or story/share-card libs.
---

# UI Reviewer

Run this when the diff touches `app/web/components/**`, `app/web/app/(main|auth)/**`, styles, or card libs (per `.claude/reviewers/ui-reviewer.md`).

## Procedure
1. Read the charter `.claude/reviewers/ui-reviewer.md` and checklist `.claude/checklists/ui-ux.md`. Recall the `design-system-v2` + `user-preferences` memories.
2. Render the touched screen **live** with the Playwright MCP at 390px (mobile) and a desktop width. Screenshot both. Capture console messages.
3. Delegate the accessibility pass to the **`ecc:a11y-architect`** agent.
4. Walk the checklist: brand fidelity, mobile layout, state coverage, a11y, render integrity. Compare against the benchmark (Strava/Duolingo/Apple Fitness).
5. Emit findings + attach before/after screenshots.

## Output (machine-readable)
Write findings to `.quality/findings/ui.json` per `scripts/review/finding.schema.json` (severities `critical|high|medium|low`); reference the captured screenshots in each finding's `detail`. Then `npm run review:aggregate` enforces the gate. **Critical** = a console error or broken mobile layout on a benchmark screen. A design-system violation (black CTA, SaaS look) is **high**. Polish is **low**.
