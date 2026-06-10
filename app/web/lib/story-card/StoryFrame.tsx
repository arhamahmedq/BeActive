import type { ReactNode } from 'react'
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
} from './constants'

// ---------------------------------------------------------------------------
// StoryFrame — the safe-area enforcer for every BeActive story template.
// ---------------------------------------------------------------------------
// Renders the fixed 1080×1920 canvas, paints the shared brand background, and
// lays out children inside an inset "stage" that is exactly the Instagram safe
// band (canvas minus STORY_SAFE.TOP / BOTTOM / X). Children are centered in the
// band by default, so any composition dropped inside is guaranteed to clear
// Instagram's native chrome on every device.
//
// Future templates should ALWAYS wrap their content in <StoryFrame> rather than
// positioning against the raw canvas — that is how safe-area constraints are
// inherited automatically. Pass `debug` (e.g. via ?debug=safe) to overlay the
// unsafe zones for visual verification.
//
// Satori note: every element that has children needs an explicit `display`.
// We set display:'flex' on every <div> to satisfy the renderer.
// ---------------------------------------------------------------------------

interface StoryFrameProps {
  children: ReactNode
  /** Override the brand background gradient if a template needs a custom one. */
  background?: string
  /** Vertical placement of content within the safe band. Default: centered. */
  align?: 'center' | 'top'
  /** Show the small translucent "BeActive" wordmark in the top unsafe zone. */
  brandMark?: boolean
  /** Overlay the unsafe zones + safe band outline for verification. */
  debug?: boolean
}

// ---------------------------------------------------------------------------
// Decorative "liquid glass" atmosphere
// ---------------------------------------------------------------------------
// Soft aurora blobs, an ambient halo behind the card, a frozen sheen, and a
// few floating glass particles — all defined once in constants.ts and shared
// with the live (Framer Motion) preview. ALL of this is decorative — per the
// IG safe area rules, the top unsafe zone may hold decoration + the brand
// mark, and the bottom unsafe zone may hold decoration only (never stats/
// streak/brand text, which live in `children` inside the safe band). Soft
// radial gradients that fade to transparent read as "blurred" without CSS
// `filter`, which Satori does not support.
// ---------------------------------------------------------------------------
function GlassAtmosphere() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {AURORA_BLOBS.map((blob, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: blob.size,
            height: blob.size,
            borderRadius: '50%',
            background: blob.gradient,
            display: 'flex',
            ...blob.pos,
          }}
        />
      ))}

      {/* Ambient halo behind the card — large, soft, mostly hidden behind the
          card's opaque surface; the visible "ring" around its edges is what
          gives it a suspended, lit-from-within feel (Section 6: depth). */}
      <div
        style={{
          position: 'absolute',
          width: CARD_HALO.size,
          height: CARD_HALO.size,
          borderRadius: '50%',
          background: CARD_HALO.gradient,
          display: 'flex',
          ...CARD_HALO.pos,
        }}
      />

      {/* Frozen refraction sheen — a faint diagonal light band across the
          whole canvas. The card (opaque, painted later) sits on top of it, so
          it only reads in the surrounding atmosphere. */}
      <div style={{ position: 'absolute', inset: 0, background: SHEEN_GRADIENT, display: 'flex' }} />

      {GLASS_PARTICLES.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: particleGradient(p.opacity),
            display: 'flex',
            ...p.pos,
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Brand mark — a small, translucent "BeActive" wordmark centered in the top
// unsafe zone. Understated on purpose (Section 1): a signature, not a banner.
// ---------------------------------------------------------------------------
function BrandMark() {
  return (
    <div style={{ position: 'absolute', top: 92, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', opacity: 0.76 }}>
        <span style={{ fontSize: 46, fontWeight: 700, color: '#0B0F0C', letterSpacing: '-0.01em' }}>Be</span>
        <span style={{ fontSize: 46, fontWeight: 800, color: '#16A34A', letterSpacing: '-0.01em' }}>Active</span>
      </div>
    </div>
  )
}

export function StoryFrame({
  children,
  background = STORY_BG,
  align = 'center',
  brandMark = true,
  debug = false,
}: StoryFrameProps) {
  return (
    <div
      style={{
        width: STORY_CANVAS.WIDTH,
        height: STORY_CANVAS.HEIGHT,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        background,
        fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <GlassAtmosphere />
      {brandMark ? <BrandMark /> : null}

      {/* Safe-band stage — explicitly sized to the IG safe band and pinned at
          its top-left. (Explicit width/height rather than top/bottom/left/right
          insets — Satori/Yoga lays out flex children far more reliably when the
          container has a concrete size.) Content is centered by default. */}
      <div
        style={{
          position: 'absolute',
          top: STORY_SAFE.TOP,
          left: STORY_SAFE.X,
          width: STORY_SAFE_BAND.width,
          height: STORY_SAFE_BAND.height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: align === 'top' ? 'flex-start' : 'center',
        }}
      >
        {children}
      </div>

      {debug ? <SafeAreaDebugOverlay /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Debug overlay — paints the two unsafe zones (red) and the safe band (green
// dashed outline). Gated behind an explicit flag; never shown in normal output.
// ---------------------------------------------------------------------------
function SafeAreaDebugOverlay() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
      {/* Top unsafe zone */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: STORY_SAFE.TOP,
          background: 'rgba(239,68,68,0.20)',
          borderBottom: '3px solid rgba(239,68,68,0.85)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 10,
        }}
      >
        <span style={{ color: '#7F1D1D', fontSize: 26, fontWeight: 800 }}>
          IG TOP UNSAFE · {STORY_SAFE.TOP}px
        </span>
      </div>

      {/* Bottom unsafe zone */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: STORY_SAFE.BOTTOM,
          background: 'rgba(239,68,68,0.20)',
          borderTop: '3px solid rgba(239,68,68,0.85)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 10,
        }}
      >
        <span style={{ color: '#7F1D1D', fontSize: 26, fontWeight: 800 }}>
          IG BOTTOM UNSAFE · {STORY_SAFE.BOTTOM}px
        </span>
      </div>

      {/* Safe band outline */}
      <div
        style={{
          position: 'absolute',
          top: STORY_SAFE.TOP,
          left: STORY_SAFE.X,
          width: STORY_SAFE_BAND.width,
          height: STORY_SAFE_BAND.height,
          border: '3px dashed rgba(22,163,74,0.85)',
          display: 'flex',
        }}
      />
    </div>
  )
}
