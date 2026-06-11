import { StoryFrame } from './StoryFrame'
import { STORY_SAFE_BAND } from './constants'
import { VerifiedBadge, WorkoutIcon, PlantGlyph, type StoryCardPlant } from './icons'

// ---------------------------------------------------------------------------
// StoryCard — the BeActive "proof card" template (reusable; rendered by the
// production OG route and by the dev preview route with identical output).
//
// It is intentionally a PURE presentational component: it receives fully
// resolved data (image already a data URI, plant/workout already mapped) and
// renders. All Instagram safe-area behavior is inherited from <StoryFrame>, so
// this template never positions against the raw 1080×1920 canvas.
//
// Three sections, top to bottom:
//   1. PHOTO  — the workout proof (focal point) + identity chip + type pill.
//   2. INFO   — the achievement ("COMPLETED") and the only metrics BeActive
//               actually tracks: streak, plant tier, best. Always fully visible.
//   3. BRAND  — one lightweight "› BeActive" mark below the card.
//
// Satori note: every element with children needs an explicit `display`.
// ---------------------------------------------------------------------------

export interface StoryCardData {
  imageUrl: string
  avatarUrl: string | null
  username: string
  workoutLabel: string
  workoutType: string
  streakCount: number
  bestStreak: number
  isPersonalBest: boolean
  plant: StoryCardPlant
  plantName: string
  /** Overlay the IG safe zones for verification (via ?debug=safe). */
  debug?: boolean
  /** Overlay a mock Instagram Story UI chrome for visualization (via ?debug=ig). */
  igChrome?: boolean
}

// Vertical divider used inside the metric band.
function MetricDivider() {
  return (
    <div
      style={{
        width: 1.5,
        background:
          'linear-gradient(to bottom, transparent, rgba(34,197,94,0.28) 18%, rgba(34,197,94,0.28) 82%, transparent)',
        display: 'flex',
      }}
    />
  )
}

export function StoryCard({
  imageUrl,
  avatarUrl,
  username,
  workoutLabel,
  workoutType,
  streakCount,
  bestStreak,
  isPersonalBest,
  plant,
  plantName,
  debug = false,
  igChrome = false,
}: StoryCardData) {
  const CARD_W = STORY_SAFE_BAND.width // fills the safe band width (936px)
  const PHOTO_H = 560

  // Bottom-anchored + no top brand mark: all vertical slack collects at the TOP
  // so the composition sits in the lower-middle, leaving the top ~20-25% as
  // ambient-only breathing room that clears Instagram's header/controls overlay.
  // The only BeActive brand is the footer bar — protected in the bottom third.
  return (
    <StoryFrame brandMark={false} align="bottom" debug={debug} igChrome={igChrome} igUsername={username}>
      {/* ===== THE CARD ===== */}
      <div
        style={{
          width: CARD_W,
          height: 1040,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 56,
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow:
            '0 60px 140px rgba(20,83,45,0.14), 0 30px 90px rgba(15,42,24,0.18), 0 6px 22px rgba(15,42,24,0.07), inset 0 1px 0 rgba(255,255,255,1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* --- Section 1: PHOTO (the proof) --- */}
        <div style={{ position: 'relative', width: '100%', height: PHOTO_H, display: 'flex', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            width={CARD_W}
            height={PHOTO_H}
            style={{ position: 'absolute', top: 0, left: 0, width: CARD_W, height: PHOTO_H, objectFit: 'cover', objectPosition: 'center' }}
            alt=""
          />

          {/* top scrim — keeps the pill + badge legible over bright photos */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 170,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.30), transparent)',
              display: 'flex',
            }}
          />
          {/* bottom scrim — keeps the identity chip legible */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 240,
              background: 'linear-gradient(to top, rgba(0,0,0,0.58), transparent)',
              display: 'flex',
            }}
          />

          {/* workout-type pill — top-left */}
          <div
            style={{
              position: 'absolute',
              top: 26,
              left: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(255,255,255,0.93)',
              borderRadius: 100,
              padding: '13px 24px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.20)',
            }}
          >
            <WorkoutIcon type={workoutType} size={32} />
            <span style={{ color: '#0B0F0C', fontSize: 28, fontWeight: 800, letterSpacing: '0.02em' }}>{workoutLabel}</span>
          </div>

          {/* verified badge — top-right (AI-verified proof is the product) */}
          <div style={{ position: 'absolute', top: 22, right: 24, display: 'flex' }}>
            <VerifiedBadge size={66} />
          </div>

          {/* identity chip — bottom-left, on the scrim */}
          <div style={{ position: 'absolute', bottom: 24, left: 30, display: 'flex', alignItems: 'center', gap: 16 }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                width={56}
                height={56}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.85)' }}
                alt=""
              />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4ADE80, #16A34A)',
                  border: '2px solid rgba(255,255,255,0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>{(username[0] ?? '?').toUpperCase()}</span>
              </div>
            )}
            <span style={{ color: '#fff', fontSize: 30, fontWeight: 800, letterSpacing: '-0.01em' }}>
              @{username}
            </span>
          </div>
        </div>

        {/* --- Section 2: INFO (achievement + key metrics) --- */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 56px', gap: 36 }}>
          {/* achievement */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#16A34A', fontSize: 24, fontWeight: 800, letterSpacing: '0.18em' }}>WORKOUT</span>
            <span style={{ color: '#0B0F0C', fontSize: 96, fontWeight: 800, lineHeight: 0.92, letterSpacing: '-0.04em' }}>COMPLETED</span>
          </div>

          {/* key-metric band — only what BeActive actually tracks */}
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              background: 'rgba(34,197,94,0.07)',
              border: '1.5px solid rgba(34,197,94,0.16)',
              borderRadius: 34,
              padding: '36px 16px',
            }}
          >
            {/* STREAK */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#16A34A', fontSize: 84, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{streakCount}</span>
              <span style={{ color: '#6B7280', fontSize: 19, fontWeight: 700, letterSpacing: '0.1em' }}>DAY STREAK</span>
            </div>

            <MetricDivider />

            {/* PLANT */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <PlantGlyph plant={plant} size={58} />
              <span
                style={{
                  color: '#16A34A',
                  fontSize: plantName.length > 10 ? 19 : 23,
                  fontWeight: 800,
                  letterSpacing: '0.01em',
                  textAlign: 'center',
                }}
              >
                {plantName}
              </span>
            </div>

            <MetricDivider />

            {/* BEST */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  color: isPersonalBest ? '#16A34A' : '#0B0F0C',
                  fontSize: isPersonalBest ? 52 : 84,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {isPersonalBest ? 'NEW' : bestStreak}
              </span>
              <span style={{ color: '#6B7280', fontSize: 19, fontWeight: 700, letterSpacing: '0.1em' }}>BEST</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Section 3: BRAND (glass CTA bar, above the unsafe zone) ===== */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          marginTop: 40,
          padding: '14px 32px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 8px 24px rgba(20,83,45,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ color: '#0B0F0C', fontSize: 40, fontWeight: 800, letterSpacing: '-0.01em' }}>Be</span>
          <span style={{ color: '#16A34A', fontSize: 40, fontWeight: 800, letterSpacing: '-0.01em' }}>Active</span>
        </div>
        <span style={{ color: '#6B7280', fontSize: 20, fontWeight: 700, letterSpacing: '0.08em' }}>BUILD YOUR STREAK</span>
      </div>
    </StoryFrame>
  )
}
