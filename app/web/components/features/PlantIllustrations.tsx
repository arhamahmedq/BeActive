import type { PlantLevel } from '@/lib/streak-levels'

const POT_FILL = '#a8a29e'
const TRUNK_FILL = '#a16207'

// ── Per-level silhouette — foliage drawn in `lvl.color`, pot/trunk neutral ──
function PlantSilhouette({ level }: { level: PlantLevel }) {
  const fill = level.color

  switch (level.level) {
    case 0: // Dormant Seed — bare pot, single seed resting in the soil
      return (
        <>
          <path d="M20 50 L44 50 L40 60 L24 60 Z" fill={POT_FILL} />
          <ellipse cx="32" cy="48" rx="5" ry="3.5" fill={fill} />
        </>
      )
    case 1: // Sprout — thin stem, two small leaves
      return (
        <>
          <path d="M20 50 L44 50 L40 60 L24 60 Z" fill={POT_FILL} />
          <line x1="32" y1="50" x2="32" y2="36" stroke={fill} strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="26" cy="37" rx="6.5" ry="3.5" fill={fill} transform="rotate(-30 26 37)" />
          <ellipse cx="38" cy="35" rx="6.5" ry="3.5" fill={fill} transform="rotate(30 38 35)" />
        </>
      )
    case 2: // Young Plant — fuller leafy plant (matches 🪴)
      return (
        <>
          <path d="M18 50 L46 50 L42 61 L22 61 Z" fill={POT_FILL} />
          <line x1="32" y1="50" x2="32" y2="34" stroke={fill} strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx="32" cy="24" rx="6" ry="11" fill={fill} />
          <ellipse cx="22" cy="32" rx="8" ry="4" fill={fill} transform="rotate(-35 22 32)" />
          <ellipse cx="42" cy="32" rx="8" ry="4" fill={fill} transform="rotate(35 42 32)" />
        </>
      )
    case 3: // Strong Tree — small rounded canopy
      return (
        <>
          <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
          <rect x="30" y="34" width="4" height="22" fill={TRUNK_FILL} />
          <circle cx="32" cy="26" r="12" fill={fill} />
        </>
      )
    case 4: // Ancient Tree — broader, layered canopy
      return (
        <>
          <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
          <rect x="29" y="32" width="6" height="24" fill={TRUNK_FILL} />
          <circle cx="24" cy="24" r="11" fill={fill} />
          <circle cx="40" cy="24" r="11" fill={fill} />
          <circle cx="32" cy="16" r="12" fill={fill} />
        </>
      )
    case 5: // Elder Tree — conifer silhouette (matches 🎄)
      return (
        <>
          <path d="M24 56 L40 56 L37.5 61 L26.5 61 Z" fill={POT_FILL} />
          <rect x="30" y="46" width="4" height="10" fill={TRUNK_FILL} />
          <polygon points="32,32 22,46 42,46" fill={fill} />
          <polygon points="32,22 23,38 41,38" fill={fill} />
          <polygon points="32,12 24,30 40,30" fill={fill} />
        </>
      )
    case 6: // Legendary Bloom — tree + blossom accents in `lvl.color` (pink)
      return (
        <>
          <path d="M22 56 L42 56 L39 61 L25 61 Z" fill={POT_FILL} />
          <rect x="29" y="32" width="6" height="24" fill={TRUNK_FILL} />
          <circle cx="24" cy="24" r="11" fill="#16a34a" />
          <circle cx="40" cy="24" r="11" fill="#16a34a" />
          <circle cx="32" cy="16" r="12" fill="#16a34a" />
          <circle cx="20" cy="18" r="3" fill={fill} />
          <circle cx="44" cy="20" r="3" fill={fill} />
          <circle cx="32" cy="8" r="3" fill={fill} />
          <circle cx="38" cy="32" r="3" fill={fill} />
        </>
      )
    default:
      return null
  }
}

// ── Lock badge — overlaid on the bottom-right corner when `locked` ──────────
function LockBadge() {
  return (
    <g transform="translate(44, 44)">
      <circle cx="0" cy="0" r="11" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.5" />
      <rect x="-5" y="-1" width="10" height="8" rx="1.5" fill="none" stroke="#9ca3af" strokeWidth="1.75" />
      <path d="M-3 -1V-3a3 3 0 016 0v2" fill="none" stroke="#9ca3af" strokeWidth="1.75" strokeLinecap="round" />
    </g>
  )
}

interface PlantIllustrationProps {
  level: PlantLevel
  size?: number
  locked?: boolean
}

export function PlantIllustration({ level, size = 64, locked = false }: PlantIllustrationProps) {
  return (
    <svg
      // viewBox padded 4px on every side so the background circle's stroke and
      // the plant silhouette never sit flush against (and get clipped by) the
      // SVG frame — keeps every tier fully "inside the picture".
      viewBox="-4 -4 72 72"
      width={size}
      height={size}
      className={locked ? 'grayscale opacity-40' : ''}
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill={level.bgColor} stroke={level.borderColor} strokeWidth="2" />
      <PlantSilhouette level={level} />
      {locked && <LockBadge />}
    </svg>
  )
}
