import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { isAppError, toErrorResponse, InternalError, ForbiddenError, NotFoundError } from '@/server/core/errors/AppError'
import { findPostById } from '@/server/modules/posts/posts.repo'
import { getMyStreak } from '@/server/modules/streaks/streaks.service'
import { getProfile } from '@/server/modules/users/users.service'

// ---------------------------------------------------------------------------
// Plant evolution ladder — mirrors streak-levels.ts (no client import in route)
// ---------------------------------------------------------------------------
const PLANT_LEVELS = [
  { level: 0, emoji: '🌱', name: 'Dormant Seed', from: 0 },
  { level: 1, emoji: '🌿', name: 'Sprout', from: 1 },
  { level: 2, emoji: '🪴', name: 'Young Plant', from: 7 },
  { level: 3, emoji: '🌲', name: 'Strong Tree', from: 30 },
  { level: 4, emoji: '🌳', name: 'Ancient Tree', from: 100 },
  { level: 5, emoji: '🎄', name: 'Elder Tree', from: 200 },
  { level: 6, emoji: '🌸', name: 'Legendary Bloom', from: 365 },
] as const

type PlantLevel = typeof PLANT_LEVELS[number]

function getPlant(days: number): PlantLevel {
  let current: PlantLevel = PLANT_LEVELS[0]
  for (const lvl of PLANT_LEVELS) {
    if (days >= lvl.from) current = lvl
    else break
  }
  return current
}

const WORKOUT_LABELS: Record<string, string> = {
  GYM: 'GYM DAY',
  RUNNING: 'RUN',
  CYCLING: 'RIDE',
  SWIMMING: 'SWIM',
  OUTDOOR: 'OUTDOOR',
  SPORTS: 'SPORT',
  OTHER: 'WORKOUT',
}

const WORKOUT_ICONS: Record<string, string> = {
  GYM: '🏋️',
  RUNNING: '🏃',
  CYCLING: '🚴',
  SWIMMING: '🏊',
  OUTDOOR: '🌄',
  SPORTS: '⚽',
  OTHER: '💪',
}

// ---------------------------------------------------------------------------
// Font loading — Plus Jakarta Sans Bold + ExtraBold from Google Fonts
// Cached at module level so it only fetches once per cold start
// ---------------------------------------------------------------------------
let _fontBold: ArrayBuffer | null = null
let _fontExtraBold: ArrayBuffer | null = null

async function loadFonts() {
  if (_fontBold && _fontExtraBold) return { bold: _fontBold, extraBold: _fontExtraBold }

  const [bold, extraBold] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU79TR.woff'
    ).then((r) => r.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_ku7BTR.woff'
    ).then((r) => r.arrayBuffer()),
  ])

  _fontBold = bold
  _fontExtraBold = extraBold
  return { bold, extraBold }
}

// ---------------------------------------------------------------------------
// Card data shape — resolved before JSX render
// ---------------------------------------------------------------------------
interface StoryCardData {
  imageUrl: string
  avatarUrl: string | null
  username: string
  workoutLabel: string
  workoutIcon: string
  streakCount: number
  bestStreak: number
  isPersonalBest: boolean
  plantEmoji: string
  plantName: string
  filledDots: number
  emptyDots: number
}

// ---------------------------------------------------------------------------
// Story card component — outside try/catch to satisfy error-boundaries lint rule
// ---------------------------------------------------------------------------
function StoryCard({
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
  filledDots,
  emptyDots,
}: StoryCardData) {
  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        background: 'linear-gradient(160deg, #E8F4EC 0%, #F0F0EE 35%, #FAFAFA 100%)',
        fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative background glow blobs */}
      <div
        style={{
          position: 'absolute',
          top: -60,
          left: -100,
          width: 400,
          height: 400,
          background: 'radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)',
          borderRadius: '50%',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 200,
          right: -80,
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          display: 'flex',
        }}
      />

      {/* Zone 1: Logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginTop: 64,
          height: 60,
        }}
      >
        <span style={{ color: '#22C55E', fontSize: 46, fontWeight: 900, lineHeight: 1 }}>›</span>
        <span style={{ color: '#111827', fontSize: 46, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}>
          Be Active
        </span>
      </div>

      {/* Zone 2: User info bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(255,255,255,0.85)',
          borderRadius: 100,
          padding: '0 44px',
          marginTop: 28,
          width: '88%',
          height: 104,
          boxShadow: '0 4px 32px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1 }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              width={56}
              height={56}
              style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(34,197,94,0.3)' }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #BBF7D0, #86EFAC)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
              }}
            >
              🏃
            </div>
          )}
          <span style={{ color: '#111827', fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>
            @{username}
          </span>
        </div>

        <div
          style={{
            width: 1,
            height: 56,
            background: 'linear-gradient(to bottom, transparent, #E5E7EB 30%, #E5E7EB 70%, transparent)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 40px' }}>
          <span style={{ color: '#9CA3AF', fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            DAY
          </span>
          <span style={{ color: '#111827', fontSize: 38, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {streakCount}
          </span>
        </div>

        <div
          style={{
            width: 1,
            height: 56,
            background: 'linear-gradient(to bottom, transparent, #E5E7EB 30%, #E5E7EB 70%, transparent)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 40px' }}>
          <span style={{ color: '#9CA3AF', fontSize: 15, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            PLANT
          </span>
          <span style={{ color: '#22C55E', fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{plantEmoji}</span>
        </div>
      </div>

      {/* Zone 3+4: Hero photo + plant */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 760,
          marginTop: 28,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          width={1080}
          height={760}
          style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', objectPosition: 'center top' }}
          alt=""
        />

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 480,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(240,240,238,0.75) 45%, rgba(240,240,238,0.96) 75%, rgba(240,240,238,1) 100%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 120,
            background: 'linear-gradient(to right, rgba(240,240,238,0.4), transparent)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 120,
            background: 'linear-gradient(to left, rgba(240,240,238,0.4), transparent)',
            display: 'flex',
          }}
        />

        {/* Green glow rings */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 380,
            width: 320,
            height: 320,
            background: 'radial-gradient(circle, rgba(34,197,94,0.32) 0%, rgba(34,197,94,0.12) 45%, transparent 70%)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 430,
            width: 220,
            height: 220,
            background: 'radial-gradient(circle, rgba(34,197,94,0.45) 0%, rgba(34,197,94,0.2) 50%, transparent 75%)',
            borderRadius: '50%',
            display: 'flex',
          }}
        />

        {/* Floating leaves */}
        <span style={{ position: 'absolute', bottom: 180, left: 120, fontSize: 70, opacity: 0.6, transform: 'rotate(-25deg)' }}>
          🍃
        </span>
        <span style={{ position: 'absolute', bottom: 260, right: 100, fontSize: 55, opacity: 0.45, transform: 'rotate(20deg)' }}>
          🍃
        </span>

        {/* Plant hero */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          <span style={{ fontSize: 200, lineHeight: 1 }}>{plantEmoji}</span>
        </div>
      </div>

      {/* Zone 5: Data card */}
      <div
        style={{
          width: '94%',
          marginTop: 12,
          background: 'rgba(255,255,255,0.96)',
          border: '1.5px solid rgba(255,255,255,0.9)',
          borderRadius: 48,
          padding: '44px 56px',
          boxShadow: '0 8px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.10)',
              border: '1.5px solid rgba(34,197,94,0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              flexShrink: 0,
            }}
          >
            {workoutIcon}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ color: '#9CA3AF', fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {workoutLabel}
            </span>
            <span style={{ color: '#111827', fontSize: 80, fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
              COMPLETED
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              flex: 1,
              height: 1.5,
              background: 'linear-gradient(to right, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)',
              display: 'flex',
            }}
          />
          <span style={{ fontSize: 22, opacity: 0.5 }}>💓</span>
          <div
            style={{
              flex: 1,
              height: 1.5,
              background: 'linear-gradient(to left, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)',
              display: 'flex',
            }}
          />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>🔥</span>
            <span style={{ color: '#111827', fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {streakCount}
            </span>
            <span style={{ color: '#9CA3AF', fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              STREAK
            </span>
          </div>

          <div
            style={{
              width: 1,
              background: 'linear-gradient(to bottom, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)',
              display: 'flex',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>{plantEmoji}</span>
            <span
              style={{
                color: '#22C55E',
                fontSize: plantName.length > 10 ? 26 : 32,
                fontWeight: 800,
                lineHeight: 1.1,
                textAlign: 'center',
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
              }}
            >
              {plantName}
            </span>
            <span style={{ color: '#9CA3AF', fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              PLANT
            </span>
          </div>

          <div
            style={{
              width: 1,
              background: 'linear-gradient(to bottom, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)',
              display: 'flex',
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>{isPersonalBest ? '🏆' : '⭐'}</span>
            <span
              style={{
                color: isPersonalBest ? '#22C55E' : '#111827',
                fontSize: isPersonalBest ? 34 : 56,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                textAlign: 'center',
              }}
            >
              {isPersonalBest ? 'NEW' : bestStreak}
            </span>
            <span style={{ color: '#9CA3AF', fontSize: 17, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>
              BEST
            </span>
          </div>
        </div>

        {/* Streak progress strip */}
        <div
          style={{
            background: 'rgba(34,197,94,0.07)',
            borderRadius: 28,
            padding: '28px 32px',
            border: '1.5px solid rgba(34,197,94,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              flexShrink: 0,
            }}
          >
            🌿
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ color: '#22C55E', fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em' }}>
                {streakCount}
              </span>
              <span style={{ color: '#374151', fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' }}>
                DAY STREAK
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {Array.from({ length: filledDots }).map((_, i) => (
                <div
                  key={`f${i}`}
                  style={{
                    height: 8,
                    flex: 1,
                    maxWidth: 72,
                    background: 'linear-gradient(90deg, #22C55E, #16A34A)',
                    borderRadius: 4,
                    display: 'flex',
                  }}
                />
              ))}
              {Array.from({ length: emptyDots }).map((_, i) => (
                <div
                  key={`e${i}`}
                  style={{
                    height: 8,
                    flex: 1,
                    maxWidth: 72,
                    background: 'rgba(34,197,94,0.15)',
                    borderRadius: 4,
                    display: 'flex',
                  }}
                />
              ))}
            </div>
          </div>

          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 22,
              background: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              flexShrink: 0,
            }}
          >
            {plantEmoji}
          </div>
        </div>
      </div>

      {/* Zone 6: Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 'auto',
          paddingBottom: 44,
        }}
      >
        <span style={{ color: '#22C55E', fontSize: 26, fontWeight: 900 }}>›</span>
        <span style={{ color: '#9CA3AF', fontSize: 26, fontWeight: 600, letterSpacing: '0.02em' }}>BeActive</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Route handler — resolves all data, then renders JSX outside try/catch
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<ImageResponse | NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('postId')

  if (!postId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'postId is required' } },
      { status: 400 }
    )
  }

  let cardData: StoryCardData
  let fonts: { bold: ArrayBuffer; extraBold: ArrayBuffer } | null = null

  try {
    const [post, streak, profile, loadedFonts] = await Promise.all([
      findPostById(postId),
      getMyStreak(auth.userId),
      getProfile(auth.userId),
      loadFonts().catch(() => null),
    ])

    if (!post) throw new NotFoundError('Post')

    const ownerId = (post as { user?: { id?: string } }).user?.id
    if (!ownerId || ownerId !== auth.userId) throw new ForbiddenError()
    if (post.status !== 'VERIFIED') throw new NotFoundError('Post')

    fonts = loadedFonts

    const streakCount = streak?.current ?? 0
    const bestStreak = streak?.best ?? 0
    const plant = getPlant(streakCount)
    const workoutType = (post as { workout?: { type?: string } | null }).workout?.type ?? 'OTHER'
    const filled = Math.min(streakCount, 7)

    cardData = {
      imageUrl: post.imageUrl,
      avatarUrl: profile.avatarUrl,
      username: profile.username,
      workoutLabel: WORKOUT_LABELS[workoutType] ?? 'WORKOUT',
      workoutIcon: WORKOUT_ICONS[workoutType] ?? '💪',
      streakCount,
      bestStreak,
      isPersonalBest: streakCount > 1 && streakCount === bestStreak,
      plantEmoji: plant.emoji,
      plantName: plant.name,
      filledDots: filled,
      emptyDots: Math.max(0, 7 - filled),
    }
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }

  return new ImageResponse(<StoryCard {...cardData} />, {
    width: 1080,
    height: 1920,
    fonts: fonts
      ? [
          { name: 'Plus Jakarta Sans', data: fonts.bold, weight: 700, style: 'normal' },
          { name: 'Plus Jakarta Sans', data: fonts.extraBold, weight: 900, style: 'normal' },
        ]
      : [],
  })
}
