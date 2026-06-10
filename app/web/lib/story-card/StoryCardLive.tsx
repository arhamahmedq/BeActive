'use client'

import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  STORY_CANVAS,
  STORY_SAFE,
  STORY_SAFE_BAND,
  STORY_BG,
  AURORA_BLOBS,
  CARD_HALO,
  SHEEN_GRADIENT,
  GLASS_PARTICLES,
  particleGradient,
  type EdgeOffsets,
} from './constants'
import type { StoryCardData } from './StoryCard'

// ---------------------------------------------------------------------------
// StoryCardLive — the animated, in-app twin of <StoryCard>/<StoryFrame>.
// ---------------------------------------------------------------------------
// The PNG shared to Instagram (StoryCard, rendered via Satori) is necessarily
// a single frozen frame — Satori has no JS runtime, so it cannot run Framer
// Motion, CSS animations, or any per-frame motion. This component renders the
// same composition as real DOM/CSS so the "living" liquid-glass atmosphere
// (slow blob drift, a refraction shimmer, a few floating particles) can
// actually animate — e.g. as a live preview before the user shares the static
// card. It shares its layout constants and atmosphere config with StoryFrame
// so the two stay visually in sync.
//
// Layout: the component owns a `container-type: size` box sized to the IG
// 9:16 canvas (1080×1920). All geometry is expressed via `cw()`/`ch()`, which
// convert the SAME canvas-px values used by StoryFrame into `cqw`/`cqh`
// (percent of the container's width/height) — so a value that is a circle at
// 1080px stays a circle at any preview size.
//
// Motion: every animated property is `transform` (x/y/scale) or `opacity` —
// GPU-accelerated, no layout thrashing. `useReducedMotion()` disables all
// looping animation and renders the resting frame, matching
// `prefers-reduced-motion`.
// ---------------------------------------------------------------------------

const round = (n: number) => Math.round(n * 1000) / 1000
const cw = (px: number) => `${round((px / STORY_CANVAS.WIDTH) * 100)}cqw`
const ch = (px: number) => `${round((px / STORY_CANVAS.HEIGHT) * 100)}cqh`

function convertPos(pos: EdgeOffsets): CSSProperties {
  const out: CSSProperties = {}
  if (pos.top !== undefined) out.top = ch(pos.top)
  if (pos.bottom !== undefined) out.bottom = ch(pos.bottom)
  if (pos.left !== undefined) out.left = cw(pos.left)
  if (pos.right !== undefined) out.right = cw(pos.right)
  return out
}

const FONT_FAMILY = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif'
const EASE = 'easeInOut' as const

export type StoryCardLiveData = Omit<StoryCardData, 'debug'>

export function StoryCardLive(data: StoryCardLiveData) {
  const reduced = useReducedMotion() ?? false

  return (
    <div
      style={
        {
          containerType: 'size',
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          aspectRatio: '9 / 16',
          overflow: 'hidden',
          borderRadius: 28,
          background: STORY_BG,
          fontFamily: FONT_FAMILY,
        } as CSSProperties
      }
    >
      <GlassAtmosphereLive reduced={reduced} />
      <BrandMarkLive />

      {/* Safe-band stage — same proportions as StoryFrame's safe band. */}
      <div
        style={{
          position: 'absolute',
          top: ch(STORY_SAFE.TOP),
          left: cw(STORY_SAFE.X),
          width: cw(STORY_SAFE_BAND.width),
          height: ch(STORY_SAFE_BAND.height),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CardLive {...data} />

        {/* Brand signature — glass CTA bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: ch(4),
            marginTop: ch(40),
            padding: `${ch(14)} ${cw(32)}`,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 8px 24px rgba(20,83,45,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ color: '#0B0F0C', fontSize: cw(40), fontWeight: 800, letterSpacing: '-0.01em' }}>Be</span>
            <span style={{ color: '#16A34A', fontSize: cw(40), fontWeight: 800, letterSpacing: '-0.01em' }}>Active</span>
          </div>
          <span style={{ color: '#6B7280', fontSize: cw(20), fontWeight: 700, letterSpacing: '0.08em' }}>BUILD YOUR STREAK</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atmosphere — animated aurora blobs, ambient halo, refraction sheen, and
// floating glass particles. Same source data as StoryFrame's static version.
// ---------------------------------------------------------------------------
function GlassAtmosphereLive({ reduced }: { reduced: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {AURORA_BLOBS.map((blob, i) => {
        // Each blob drifts a tiny, barely-noticeable amount on its own slow
        // loop (20-40s) — different durations/phases so they never sync up.
        const duration = 24 + i * 5
        const dx = i % 2 === 0 ? 1.4 : -1.2
        const dy = i < 2 ? 1.1 : -1.4
        return (
          <motion.div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: cw(blob.size),
              height: cw(blob.size),
              borderRadius: '50%',
              background: blob.gradient,
              ...convertPos(blob.pos),
            }}
            animate={
              reduced
                ? undefined
                : {
                    x: [`0cqw`, `${dx}cqw`, '0cqw'],
                    y: [`0cqh`, `${dy}cqh`, '0cqh'],
                    scale: [1, 1.05, 1],
                  }
            }
            transition={reduced ? undefined : { duration, repeat: Infinity, ease: EASE, delay: i * 1.5 }}
          />
        )
      })}

      {/* Ambient halo behind the card — a near-imperceptible slow "breathe". */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          width: cw(CARD_HALO.size),
          height: cw(CARD_HALO.size),
          borderRadius: '50%',
          background: CARD_HALO.gradient,
          ...convertPos(CARD_HALO.pos),
        }}
        animate={reduced ? undefined : { scale: [1, 1.03, 1], opacity: [0.9, 1, 0.9] }}
        transition={reduced ? undefined : { duration: 36, repeat: Infinity, ease: EASE }}
      />

      {/* Refraction sheen — a near-invisible diagonal shimmer drifting very
          slowly across the canvas. Sits behind the (opaque) card. */}
      <motion.div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: SHEEN_GRADIENT }}
        animate={reduced ? undefined : { x: ['-3cqw', '3cqw', '-3cqw'] }}
        transition={reduced ? undefined : { duration: 48, repeat: Infinity, ease: EASE }}
      />

      {/* Floating glass particles — 3 max, slow, different speeds + scales. */}
      {GLASS_PARTICLES.map((p, i) => {
        const duration = 26 + i * 8
        const drift = 1.2 + i * 0.4
        return (
          <motion.div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: cw(p.size),
              height: cw(p.size),
              borderRadius: '50%',
              background: particleGradient(p.opacity),
              ...convertPos(p.pos),
            }}
            animate={
              reduced
                ? undefined
                : {
                    y: ['0cqh', `${-drift}cqh`, '0cqh'],
                    opacity: [p.opacity * 0.7, p.opacity, p.opacity * 0.7],
                  }
            }
            transition={reduced ? undefined : { duration, repeat: Infinity, ease: EASE, delay: i * 2.5 }}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brand mark — small, translucent "BeActive" wordmark in the top unsafe zone.
// ---------------------------------------------------------------------------
function BrandMarkLive() {
  return (
    <div style={{ position: 'absolute', top: ch(80), left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          opacity: 0.88,
          background: 'rgba(255,255,255,0.35)',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 999,
          padding: `${ch(12)} ${cw(28)}`,
        }}
      >
        <span style={{ fontSize: cw(46), fontWeight: 700, color: '#0B0F0C', letterSpacing: '-0.01em' }}>Be</span>
        <span style={{ fontSize: cw(46), fontWeight: 800, color: '#16A34A', letterSpacing: '-0.01em' }}>Active</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The "proof card" — same composition/proportions as StoryCard.
// ---------------------------------------------------------------------------
function MetricDividerLive() {
  return (
    <div
      style={{
        width: cw(1.5),
        alignSelf: 'stretch',
        background:
          'linear-gradient(to bottom, transparent, rgba(34,197,94,0.28) 18%, rgba(34,197,94,0.28) 82%, transparent)',
      }}
    />
  )
}

function CardLive({
  imageUrl,
  avatarUrl,
  username,
  workoutLabel,
  workoutIcon,
  streakCount,
  bestStreak,
  isPersonalBest,
  plantEmoji,
  plantName,
}: StoryCardLiveData) {
  return (
    <div
      style={{
        width: '100%',
        height: ch(1180),
        background: 'rgba(255,255,255,0.97)',
        borderRadius: cw(56),
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow:
          '0 60px 140px rgba(20,83,45,0.14), 0 30px 90px rgba(15,42,24,0.18), 0 6px 22px rgba(15,42,24,0.07), inset 0 1px 0 rgba(255,255,255,1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* --- PHOTO --- */}
      <div style={{ position: 'relative', width: '100%', height: ch(620), overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: ch(170),
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.30), transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: ch(240),
            background: 'linear-gradient(to top, rgba(0,0,0,0.58), transparent)',
          }}
        />

        {/* workout-type pill */}
        <div
          style={{
            position: 'absolute',
            top: ch(26),
            left: cw(26),
            display: 'flex',
            alignItems: 'center',
            gap: cw(12),
            background: 'rgba(255,255,255,0.93)',
            borderRadius: 999,
            padding: `${ch(13)} ${cw(24)}`,
            boxShadow: '0 4px 18px rgba(0,0,0,0.20)',
          }}
        >
          <span style={{ fontSize: cw(32) }}>{workoutIcon}</span>
          <span style={{ color: '#0B0F0C', fontSize: cw(28), fontWeight: 800, letterSpacing: '0.02em' }}>{workoutLabel}</span>
        </div>

        {/* verified badge */}
        <div style={{ position: 'absolute', top: ch(22), right: cw(24), display: 'flex' }}>
          <span style={{ fontSize: cw(66), lineHeight: 1 }}>✅</span>
        </div>

        {/* identity chip */}
        <div style={{ position: 'absolute', bottom: ch(24), left: cw(30), display: 'flex', alignItems: 'center', gap: cw(16) }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              style={{ width: cw(56), height: cw(56), borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.85)' }}
            />
          ) : (
            <div
              style={{
                width: cw(56),
                height: cw(56),
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4ADE80, #16A34A)',
                border: '2px solid rgba(255,255,255,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontSize: cw(28), fontWeight: 800 }}>{(username[0] ?? '?').toUpperCase()}</span>
            </div>
          )}
          <span style={{ color: '#fff', fontSize: cw(30), fontWeight: 800, letterSpacing: '-0.01em' }}>@{username}</span>
        </div>
      </div>

      {/* --- INFO --- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${cw(56)}`, gap: ch(36) }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: ch(4) }}>
          <span style={{ color: '#16A34A', fontSize: cw(24), fontWeight: 800, letterSpacing: '0.18em' }}>WORKOUT</span>
          <span style={{ color: '#0B0F0C', fontSize: cw(96), fontWeight: 800, lineHeight: 0.92, letterSpacing: '-0.04em' }}>COMPLETED</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            background: 'rgba(34,197,94,0.07)',
            border: '1.5px solid rgba(34,197,94,0.16)',
            borderRadius: cw(34),
            padding: `${ch(36)} ${cw(16)}`,
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ch(6) }}>
            <span style={{ color: '#16A34A', fontSize: cw(84), fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{streakCount}</span>
            <span style={{ color: '#6B7280', fontSize: cw(19), fontWeight: 700, letterSpacing: '0.1em' }}>DAY STREAK</span>
          </div>

          <MetricDividerLive />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ch(6) }}>
            <span style={{ fontSize: cw(58), lineHeight: 1 }}>{plantEmoji}</span>
            <span
              style={{
                color: '#16A34A',
                fontSize: plantName.length > 10 ? cw(19) : cw(23),
                fontWeight: 800,
                letterSpacing: '0.01em',
                textAlign: 'center',
              }}
            >
              {plantName}
            </span>
          </div>

          <MetricDividerLive />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ch(6) }}>
            <span
              style={{
                color: isPersonalBest ? '#16A34A' : '#0B0F0C',
                fontSize: isPersonalBest ? cw(52) : cw(84),
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {isPersonalBest ? 'NEW' : bestStreak}
            </span>
            <span style={{ color: '#6B7280', fontSize: cw(19), fontWeight: 700, letterSpacing: '0.1em' }}>BEST</span>
          </div>
        </div>
      </div>
    </div>
  )
}
