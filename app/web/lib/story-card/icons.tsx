// ---------------------------------------------------------------------------
// Story-card icons — local, network-free replacements for emoji glyphs.
// ---------------------------------------------------------------------------
// `next/og`'s ImageResponse has no bundled emoji glyphs: it resolves emoji by
// fetching an SVG from a CDN (twemoji, by default) DURING the lazy Satori
// render. Because that render runs after the route handler returns, a slow or
// failed CDN fetch crashes the worker with an empty reply — uncatchable by any
// try/catch in the route. See docs/Story Sharing Architecture V3.md §4.1/§10.
//
// Fix: every glyph the story card needs (verified badge, plant tiers, workout
// type icons, IG-chrome heart/send) is drawn here as plain SVG primitives
// (path/circle/rect/polygon with solid fills/strokes — no gradients, filters,
// or masks). Zero network, zero external font/icon dependency.
//
// IMPORTANT — Satori `<svg>` children must be literal host elements, not
// nested function components or Fragments. A `<svg>` whose child is a
// component returning `<>...</>` silently renders nothing (verified: the
// VerifiedBadge pattern below — direct `<circle>`/`<path>` children — works;
// a Fragment-wrapped sub-component as an `<svg>` child does not). So every
// icon variant is its own component returning ONE complete `<svg>...</svg>`
// with literal children — never an `<svg>` whose child is another component.
//
// `size` accepts a number (px, for the static Satori card) or a string (e.g.
// a `cqw`/`cqh` value, for the live framer-motion twin) — both renderers use
// the SAME components, applied via `style.width`/`style.height`.
// ---------------------------------------------------------------------------

type IconSize = number | string
type GlyphProps = { size: IconSize; color: string }

// ── Verified badge — replaces the ✅ glyph ──────────────────────────────────
export function VerifiedBadge({ size = 66 }: { size?: IconSize }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="12" cy="12" r="12" fill="#16A34A" />
      <path d="M7 12.5L10.5 16L17 8" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Workout-type icons — replace 🏋️🏃🚴🏊🌄⚽💪 ───────────────────────────────
function GymGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <rect x="1" y="9" width="3" height="6" rx="1" fill={color} />
      <rect x="4.5" y="7" width="2.5" height="10" rx="1" fill={color} />
      <rect x="7.5" y="11" width="9" height="2" fill={color} />
      <rect x="17" y="7" width="2.5" height="10" rx="1" fill={color} />
      <rect x="20" y="9" width="3" height="6" rx="1" fill={color} />
    </svg>
  )
}

function RunningGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <polygon points="13,1 4,13 11,13 9,23 20,10 12,10" fill={color} />
    </svg>
  )
}

function CyclingGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="6" cy="18" r="4" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="18" cy="18" r="4" fill="none" stroke={color} strokeWidth="2" />
      <path d="M6 18L10 8H14L18 18M10 8L13 13H18M13 13L11 18" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SwimmingGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <path d="M1 8C3 6 5 6 7 8C9 10 11 10 13 8C15 6 17 6 19 8C21 10 22 10 23 9" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M1 13C3 11 5 11 7 13C9 15 11 15 13 13C15 11 17 11 19 13C21 15 22 15 23 14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M1 18C3 16 5 16 7 18C9 20 11 20 13 18C15 16 17 16 19 18C21 20 22 20 23 19" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function OutdoorGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="6" cy="6" r="2.5" fill={color} />
      <path d="M1 21L9 8L13 14L16 10L23 21Z" fill={color} />
    </svg>
  )
}

function SportsGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth="2" />
      <polygon points="12,7 15.5,9.5 14.2,13.5 9.8,13.5 8.5,9.5" fill={color} />
      <path d="M12 7V3M15.5 9.5L19 7M14.2 13.5L16.5 17.5M9.8 13.5L7.5 17.5M8.5 9.5L5 7" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StarGlyph({ size, color }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <polygon points="12,1 14.6,8.4 22.5,8.4 16.1,13.1 18.5,20.5 12,16 5.5,20.5 7.9,13.1 1.5,8.4 9.4,8.4" fill={color} />
    </svg>
  )
}

export function WorkoutIcon({ type, size = 32, color = '#0B0F0C' }: { type: string; size?: IconSize; color?: string }) {
  switch (type) {
    case 'GYM':
      return <GymGlyph size={size} color={color} />
    case 'RUNNING':
      return <RunningGlyph size={size} color={color} />
    case 'CYCLING':
      return <CyclingGlyph size={size} color={color} />
    case 'SWIMMING':
      return <SwimmingGlyph size={size} color={color} />
    case 'OUTDOOR':
      return <OutdoorGlyph size={size} color={color} />
    case 'SPORTS':
      return <SportsGlyph size={size} color={color} />
    default:
      return <StarGlyph size={size} color={color} />
  }
}

// ── Plant glyph — replaces 🌱🌿🪴🌲🌳🎄🌸 ────────────────────────────────────
// Ports the same silhouettes as components/features/PlantIllustrations.tsx so
// the story card matches the in-app plant evolution art. Pure SVG primitives
// only (no gradients/filters/masks), parameterized by the snapshot's
// level/color/bgColor/borderColor instead of the live `PlantLevel` object.
export interface StoryCardPlant {
  level: number
  color: string
  bgColor: string
  borderColor: string
}

const POT_FILL = '#a8a29e'
const TRUNK_FILL = '#a16207'

type PlantGlyphProps = { size: IconSize; plant: StoryCardPlant }

// Shared backdrop circle, repeated in every level's <svg> (must be a literal
// child, not a shared sub-component — see file-header note).
function PlantSeed({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M20 50 L44 50 L40 60 L24 60 Z" fill={POT_FILL} />
      <ellipse cx="32" cy="48" rx="5" ry="3.5" fill={plant.color} />
    </svg>
  )
}

function PlantSprout({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M20 50 L44 50 L40 60 L24 60 Z" fill={POT_FILL} />
      <line x1="32" y1="50" x2="32" y2="36" stroke={plant.color} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="26" cy="37" rx="6.5" ry="3.5" fill={plant.color} transform="rotate(-30 26 37)" />
      <ellipse cx="38" cy="35" rx="6.5" ry="3.5" fill={plant.color} transform="rotate(30 38 35)" />
    </svg>
  )
}

function PlantYoung({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M18 50 L46 50 L42 61 L22 61 Z" fill={POT_FILL} />
      <line x1="32" y1="50" x2="32" y2="34" stroke={plant.color} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="32" cy="24" rx="6" ry="11" fill={plant.color} />
      <ellipse cx="22" cy="32" rx="8" ry="4" fill={plant.color} transform="rotate(-35 22 32)" />
      <ellipse cx="42" cy="32" rx="8" ry="4" fill={plant.color} transform="rotate(35 42 32)" />
    </svg>
  )
}

function PlantStrongTree({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
      <rect x="30" y="34" width="4" height="22" fill={TRUNK_FILL} />
      <circle cx="32" cy="26" r="12" fill={plant.color} />
    </svg>
  )
}

function PlantAncientTree({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
      <rect x="29" y="32" width="6" height="24" fill={TRUNK_FILL} />
      <circle cx="24" cy="24" r="11" fill={plant.color} />
      <circle cx="40" cy="24" r="11" fill={plant.color} />
      <circle cx="32" cy="16" r="12" fill={plant.color} />
    </svg>
  )
}

function PlantElderTree({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M24 56 L40 56 L37.5 61 L26.5 61 Z" fill={POT_FILL} />
      <rect x="30" y="46" width="4" height="10" fill={TRUNK_FILL} />
      <polygon points="32,32 22,46 42,46" fill={plant.color} />
      <polygon points="32,22 23,38 41,38" fill={plant.color} />
      <polygon points="32,12 24,30 40,30" fill={plant.color} />
    </svg>
  )
}

function PlantLegendaryBloom({ size, plant }: PlantGlyphProps) {
  return (
    <svg viewBox="0 0 64 64" style={{ width: size, height: size, display: 'flex' }}>
      <circle cx="32" cy="32" r="30" fill={plant.bgColor} stroke={plant.borderColor} strokeWidth="2" />
      <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
      <rect x="29" y="32" width="6" height="24" fill={TRUNK_FILL} />
      <circle cx="24" cy="24" r="11" fill="#16a34a" />
      <circle cx="40" cy="24" r="11" fill="#16a34a" />
      <circle cx="32" cy="16" r="12" fill="#16a34a" />
      <circle cx="20" cy="18" r="3" fill={plant.color} />
      <circle cx="44" cy="20" r="3" fill={plant.color} />
      <circle cx="32" cy="8" r="3" fill={plant.color} />
      <circle cx="38" cy="32" r="3" fill={plant.color} />
    </svg>
  )
}

export function PlantGlyph({ plant, size = 58 }: { plant: StoryCardPlant; size?: IconSize }) {
  switch (plant.level) {
    case 0:
      return <PlantSeed size={size} plant={plant} />
    case 1:
      return <PlantSprout size={size} plant={plant} />
    case 2:
      return <PlantYoung size={size} plant={plant} />
    case 3:
      return <PlantStrongTree size={size} plant={plant} />
    case 4:
      return <PlantAncientTree size={size} plant={plant} />
    case 5:
      return <PlantElderTree size={size} plant={plant} />
    default:
      return <PlantLegendaryBloom size={size} plant={plant} />
  }
}

// ── IG-chrome icons — replace ❤️/✈️ in StoryFrame's dev-only IGChromeOverlay ─
export function HeartIcon({ size = 56, color = '#fff' }: { size?: IconSize; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <path
        d="M12 21s-7-4.35-9.5-8.5C0.7 9.5 1.8 6 5 6c1.9 0 3.4 1 4 2.4C9.6 7 11.1 6 13 6c3.2 0 4.3 3.5 2.5 6.5C19 16.65 12 21 12 21z"
        fill={color}
      />
    </svg>
  )
}

export function SendIcon({ size = 56, color = '#fff' }: { size?: IconSize; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'flex' }}>
      <path d="M2 12L21 3L13 21L11 13L2 12Z" fill={color} />
    </svg>
  )
}
