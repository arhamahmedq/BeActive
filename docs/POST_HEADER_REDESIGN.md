# Post Header Redesign — Identity-First Top Bar

> **Status:** ✅ Shipped to feed, post-detail, and profile cards.
> **Design lab (kept, not deleted):** `/post-header-prototypes` → `app/web/app/post-header-prototypes/page.tsx`
> This doc is the compressed record of the decision so the lab route can be deleted later without losing the rationale.

---

## Problem

Every post card opened with a heavy black eyebrow rule — **`{ACTIVITY} · DAILY PROOF`** in all-caps tracking — and the author's username was buried *down inside* the streak masthead next to a small avatar.

Two issues:
- **Repetitive / shouty.** "Daily Proof" repeated on every single card added noise, not information.
- **Identity buried.** The thing a social feed needs first — *who posted this* — was the smallest, lowest element in the header.

---

## Decision — Refined Concept A

Lead with a **clean, Instagram-style identity bar**:

```
[avatar · lg]  username · time                         [ ⚽ Activity ]
```

- **Username leads**, avatar bumped up to `lg`, time as a quiet `·`-separated suffix.
- The **black "Daily Proof" eyebrow rule is gone.**
- Activity context is preserved as a **subtle neutral chip** (emoji + label) so "what workout" isn't lost — but it no longer dominates.
- The streak masthead (big drop-cap number) stays; the evolution/plant tier sits as a quiet **brand-tinted chip** beside it.

### Rejected refinements (documented so we don't re-litigate)
- **Activity subline under the username** — removed; felt cramped, made the bar busy.
- **Verified tick** — removed; verification is reserved as an *exclusive* signal for content creators in a future release, not a per-post badge.

---

## Per-surface application

| Surface | File | Header treatment |
|---------|------|------------------|
| **Feed** | `components/features/FeedCard.tsx` | Full identity bar (avatar · username · time) + Save button. Masthead keeps streak + **activity chip + evolution chip**. |
| **Post detail** | `app/(main)/p/[postId]/page.tsx` | Identity bar with `lg` avatar; **activity chip floats right** in the top bar (no streak masthead on detail). |
| **Profile** | `components/features/ProfilePostCard.tsx` | **No identity bar** — the profile page header already says whose posts these are. Masthead carries time + activity chip + evolution chip. |

### Activity emoji map (shared across surfaces)
```
GYM 🏋️ · RUNNING 🏃 · CYCLING 🚴 · SWIMMING 🏊
YOGA 🧘 · HIIT ⚡ · SPORTS ⚽ · OTHER / fallback 💪
```

---

## Chip style tokens

- **Activity chip (neutral):** `rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600`
- **Evolution chip (brand):** `rounded-full bg-brand-50 px-2 py-1 … text-brand-700`
- **Identity:** username `text-[14px] font-semibold text-gray-900` · separator `text-gray-300 ·` · time `text-[12px] font-medium text-gray-400`

The neutral activity chip is intentionally easy to drop later for a pure-Instagram look without touching layout.

---

## Design lab route

`/post-header-prototypes` renders a **Before / After** comparison (Baseline production card vs Refined Concept A) using self-contained primitives (no app hooks/providers). It's dev/design-only and safe to delete once this redesign is settled — the rationale above is the durable copy.

Related: [[design-system]], [[ui-overhaul-backlog]], `docs/SLICE_5_FEED_DESIGN.md`.
