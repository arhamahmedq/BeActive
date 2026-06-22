# loops/design — UI/UX Overhaul Loop

**Goal:** Move BeActive toward the Design System 2.0 aesthetic (consumer-grade, not SaaS) by working the prioritized visual-improvement backlog. Source of truth: the `design-system` + `ui-overhaul-backlog` + `user-preferences` memories.

## Workflow

1. Pull the next item from the backlog (memory `ui-overhaul-backlog`, P0 → P1 → P2).
2. Prototype in a lab route if exploratory (`app/web/app/*-lab/`, `designoverhaul/`, `share-card-lab/`).
3. Build it as a `loops/dev` change (branch → gate → PR) — design work still ships through the same gate.
4. **ui reviewer is mandatory** for this domain (`.claude/checklists/ui-ux.md`): brand green never black, `rounded-full` CTAs, 44px tap targets, 390px + desktop, loading/empty/error states, reduced-motion, IG safe areas for share/story cards.
5. Verify live with Playwright MCP (needs the "Playwright MCP Bridge" Chrome extension — memory `playwright-mcp-bridge-extension`).
6. Log the shipped improvement in `loops/logs.md` (filter `design:`).

## Boundaries

- Design fidelity guards in `.claude/checklists/ui-ux.md` are hard requirements, not suggestions.
- No new design dependency for what a few lines of Tailwind/CSS do (Ponytail rung 3–4).
- Don't fake data-backed UI (likes/replies that vanish on refresh) — defer to the slice that adds the API. (Glass House lesson: build the visual on real flat data.)

## Backlog / Timeline

Backlog → memory `ui-overhaul-backlog` + `UI feedback/`. Inputs/raw feedback → `UI feedback/`, `workout_pics/`. Run history → `loops/logs.md`.
