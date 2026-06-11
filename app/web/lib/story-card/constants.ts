// ---------------------------------------------------------------------------
// Story-card shared constants
// ---------------------------------------------------------------------------
// Single source of truth for every 1080×1920 story template. Layout geometry,
// Instagram safe-area insets, and the brand data ladders all live here so that
// any future template (`StoryFrame` + composition) inherits identical, vetted
// safe-area behavior instead of re-deriving margins ad hoc.
//
// WHY A FIXED CANVAS + PROPORTIONAL SAFE ZONES IS "RESPONSIVE":
// Instagram always renders a story as a 9:16 surface and letterbox-fits the
// uploaded 1080×1920 media to the device screen *uniformly*. Its native UI
// (progress bar, author header, reply bar, "Your story" buttons, action rail)
// is overlaid at the SAME proportional positions on every device — iPhone SE,
// iPhone 15 Pro Max, Pixel, Galaxy. So a safe band expressed once against the
// fixed 1080×1920 canvas is correct on all of them. We do not need per-device
// media queries; we need the content to live inside the proportional band.
// ---------------------------------------------------------------------------

/** The immutable Instagram Story canvas. Never changes — IG requires 9:16. */
export const STORY_CANVAS = {
  WIDTH: 1080,
  HEIGHT: 1920,
} as const

// ---------------------------------------------------------------------------
// Instagram Story safe-area insets (px, relative to the 1080×1920 canvas)
// ---------------------------------------------------------------------------
// TOP (250px ≈ 13%): story progress bar + author row (avatar, username,
//   timestamp) on the left and the ✕ / ⋯ controls on the right.
// BOTTOM (340px ≈ 18%): covers BOTH viewer chrome (the "Send message…" reply
//   bar + heart + share arrow, ~250px) AND the taller creator chrome the
//   sharer sees before posting (the "Your story" / "Close Friends" / Share
//   buttons, ~300px). We reserve the larger of the two so nothing is clipped
//   in either screen.
// X (72px): clears the right-edge action rail (like/share/more when viewing)
//   and the left reply affordance, and gives the composition breathing room.
//
// Tunable in one place: change these and every template re-centers itself.
export const STORY_SAFE = {
  TOP: 250,
  BOTTOM: 340,
  X: 72,
} as const

/**
 * The fully-visible rectangle in canvas coordinates. All meaningful content
 * (workout type, achievement, streak, key metric, branding) MUST live inside
 * this band. Derived — do not hand-edit.
 */
export const STORY_SAFE_BAND = {
  x: STORY_SAFE.X,
  y: STORY_SAFE.TOP,
  width: STORY_CANVAS.WIDTH - STORY_SAFE.X * 2,
  height: STORY_CANVAS.HEIGHT - STORY_SAFE.TOP - STORY_SAFE.BOTTOM,
} as const

// ---------------------------------------------------------------------------
// Brand background — light, airy, premium (Apple Fitness / Strava energy).
// One shared gradient so templates read as a family.
// ---------------------------------------------------------------------------
export const STORY_BG = 'linear-gradient(165deg, #E9F6EE 0%, #F2F4F0 46%, #FBFBFA 100%)' as const

// ---------------------------------------------------------------------------
// "Liquid glass" atmosphere — shared between the static export
// (StoryFrame, Satori) and the live preview (StoryCardLive, Framer Motion).
// All positions/sizes are in canvas px (1080×1920); each renderer converts
// them to its own units (StoryFrame uses them directly, StoryCardLive maps
// px → cqw/cqh). Per the IG safe-area rules this is ALL decorative — it lives
// in the unsafe zones around `STORY_SAFE_BAND`, never inside it.
// ---------------------------------------------------------------------------
export type EdgeOffsets = Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>

export const AURORA_BLOBS: ReadonlyArray<{ pos: EdgeOffsets; size: number; gradient: string }> = [
  // Top-left aurora — sits mostly above the safe band.
  { pos: { top: -220, left: -170 }, size: 700, gradient: 'radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 70%)' },
  // Top-right mint wash — gives the brand mark a soft field to sit on.
  { pos: { top: -260, right: -200 }, size: 640, gradient: 'radial-gradient(circle, rgba(187,247,208,0.24) 0%, transparent 70%)' },
  // Bottom-right aurora — largest, deepest tone; flows into the bottom unsafe zone.
  { pos: { bottom: -260, right: -210 }, size: 780, gradient: 'radial-gradient(circle, rgba(34,197,94,0.16) 0%, transparent 70%)' },
  // Bottom-left soft wash — adds asymmetry; also bleeds into the unsafe zone.
  { pos: { bottom: -200, left: -170 }, size: 580, gradient: 'radial-gradient(circle, rgba(187,247,208,0.20) 0%, transparent 70%)' },
] as const

/** Large soft halo centered behind the card — gives it a "suspended" feel. */
export const CARD_HALO = {
  pos: { top: 215, left: -160 } as EdgeOffsets,
  size: 1400,
  gradient: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(34,197,94,0.07) 45%, transparent 72%)',
} as const

/** Faint diagonal "frozen" refraction sheen across the whole canvas. */
export const SHEEN_GRADIENT = 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.12) 50%, transparent 65%)' as const

/** Small soft "floating glass" particles — animated in the live preview. */
export const GLASS_PARTICLES: ReadonlyArray<{ pos: EdgeOffsets; size: number; opacity: number }> = [
  { pos: { top: 64, right: 96 }, size: 72, opacity: 0.22 },
  { pos: { top: 1620, left: 64 }, size: 56, opacity: 0.18 },
  { pos: { bottom: 120, right: 200 }, size: 44, opacity: 0.16 },
] as const

export function particleGradient(opacity: number): string {
  return `radial-gradient(circle, rgba(255,255,255,${opacity}) 0%, rgba(34,197,94,${opacity * 0.6}) 40%, transparent 75%)`
}

// ---------------------------------------------------------------------------
// Plant evolution ladder — mirrors lib/streak-levels.ts. Kept as a local copy
// (not imported) so the OG route never pulls a client module into the edge/
// node render path. Values must stay in sync with streak-levels.ts.
// ---------------------------------------------------------------------------
export const PLANT_LEVELS = [
  { level: 0, name: 'Dormant Seed', from: 0, color: '#9ca3af', bgColor: '#f3f4f6', borderColor: '#e5e7eb' },
  { level: 1, name: 'Sprout', from: 1, color: '#22c55e', bgColor: '#f0fdf4', borderColor: '#bbf7d0' },
  { level: 2, name: 'Young Plant', from: 7, color: '#16a34a', bgColor: '#dcfce7', borderColor: '#86efac' },
  { level: 3, name: 'Strong Tree', from: 30, color: '#15803d', bgColor: '#dcfce7', borderColor: '#4ade80' },
  { level: 4, name: 'Ancient Tree', from: 100, color: '#166534', bgColor: '#dcfce7', borderColor: '#16a34a' },
  { level: 5, name: 'Elder Tree', from: 200, color: '#14532d', bgColor: '#dcfce7', borderColor: '#15803d' },
  { level: 6, name: 'Legendary Bloom', from: 365, color: '#be185d', bgColor: '#fdf2f8', borderColor: '#f9a8d4' },
] as const

export type PlantLevel = (typeof PLANT_LEVELS)[number]

export function getPlant(days: number): PlantLevel {
  let current: PlantLevel = PLANT_LEVELS[0]
  for (const lvl of PLANT_LEVELS) {
    if (days >= lvl.from) current = lvl
    else break
  }
  return current
}

// ---------------------------------------------------------------------------
// Workout type → display label. The icon glyph for each type is rendered by
// <WorkoutIcon type={...}> (lib/story-card/icons.tsx) — local SVG, not emoji.
// ---------------------------------------------------------------------------
export const WORKOUT_LABELS: Record<string, string> = {
  GYM: 'GYM DAY',
  RUNNING: 'RUN',
  CYCLING: 'RIDE',
  SWIMMING: 'SWIM',
  OUTDOOR: 'OUTDOOR',
  SPORTS: 'SPORT',
  OTHER: 'WORKOUT',
}
