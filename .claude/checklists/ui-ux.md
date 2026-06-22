# Checklist — UI/UX

> Reusable checks for the UI reviewer. Source of truth: Design System 2.0 (memory `design-system-v2`), `user-preferences` memory, `docs/POST_HEADER_REDESIGN.md`.
> Severity rubric in `docs/REVIEW_PROCESS.md`. Mark each finding **Blocker / Major / Minor**.

## Brand & design-system fidelity (consumer-grade, not SaaS)
- [ ] Primary CTAs use brand green (`brand-500 #22c55e`), **never black**.
- [ ] Pill CTAs are `rounded-full`; form links are `text-brand-600` (not `text-black`).
- [ ] No generic SaaS dashboard look, no plain white card on light-gray, no "Your Feed" cold headers.
- [ ] Typography is Plus Jakarta Sans via `next/font` (no FOUT, preloaded).
- [ ] Would this look at home in Strava / Duolingo / Apple Fitness? If not, flag it.

## Mobile-first layout
- [ ] Renders correctly at 390px (mobile) **and** desktop; no horizontal overflow.
- [ ] Tap targets ≥ 44×44px; MobileNav active pill + Upload FAB styling intact.
- [ ] Story/share cards respect IG safe areas (250/340/72px, `STORY_SAFE_BAND`).

## State coverage
- [ ] Loading, empty, and error states exist (not just the populated happy path).
- [ ] Streak states animate correctly: `animate-pet-bounce` on COMPLETED_TODAY, `animate-streak-pulse` on AT_RISK.
- [ ] `emptyReason` only shows on `cursor === null` (feed).

## Accessibility basics
- [ ] Images have meaningful `alt`; icon-only buttons have `aria-label`.
- [ ] Interactive elements are keyboard-reachable with a visible focus ring.
- [ ] Text contrast ≥ 4.5:1 on the dark hero and on light cards.
- [ ] Motion respects `prefers-reduced-motion` for non-essential animation.

## Render integrity (verify live with Playwright MCP)
- [ ] No console errors/warnings on the touched screen.
- [ ] No React key warnings, no hydration mismatch.
- [ ] No layout shift from late-loading images (dimensions/`aspect-ratio` set).
