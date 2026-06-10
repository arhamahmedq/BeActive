import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { isAppError, toErrorResponse, InternalError, ForbiddenError, NotFoundError } from '@/server/core/errors/AppError'
import { findPostById } from '@/server/modules/posts/posts.repo'
import { getMyStreak } from '@/server/modules/streaks/streaks.service'
import { getProfile } from '@/server/modules/users/users.service'
import { StoryCard, type StoryCardData } from '@/lib/story-card/StoryCard'
import { getPlant, WORKOUT_LABELS, WORKOUT_ICONS } from '@/lib/story-card/constants'
import { loadStoryFonts, type StoryFont } from '@/lib/story-card/font'

// ---------------------------------------------------------------------------
// Image pre-fetching — convert a remote URL to a base64 data URI so Satori
// never makes an outgoing HTTP request during render. Satori's internal image
// fetcher can time out or fail on slow CDN responses; pre-fetching here keeps
// it inside the controlled try/catch with a clear error message.
// ---------------------------------------------------------------------------
async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status} (${url})`)
  const buf = await res.arrayBuffer()
  const ct = res.headers.get('content-type') ?? 'image/jpeg'
  const b64 = Buffer.from(buf).toString('base64')
  return `data:${ct};base64,${b64}`
}

// ---------------------------------------------------------------------------
// Route handler — resolves all data, then renders the shared StoryCard template
// (the card composition + Instagram safe-area frame live in @/lib/story-card).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('postId')
  const debug = searchParams.get('debug') === 'safe'

  if (!postId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'postId is required' } },
      { status: 400 }
    )
  }

  let cardData: StoryCardData
  let fonts: StoryFont[] = []

  try {
    const [post, streak, profile, loadedFonts] = await Promise.all([
      findPostById(postId),
      getMyStreak(auth.userId),
      getProfile(auth.userId),
      loadStoryFonts(),
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

    // Pre-fetch images as data URIs so Satori renders inline — no outgoing
    // HTTP during render, which avoids CDN timeouts crashing ImageResponse.
    const [workoutDataUri, avatarDataUri] = await Promise.all([
      toDataUri(post.imageUrl),
      profile.avatarUrl ? toDataUri(profile.avatarUrl).catch(() => null) : Promise.resolve(null),
    ])

    cardData = {
      imageUrl: workoutDataUri,
      avatarUrl: avatarDataUri,
      username: profile.username,
      workoutLabel: WORKOUT_LABELS[workoutType] ?? 'WORKOUT',
      workoutIcon: WORKOUT_ICONS[workoutType] ?? '💪',
      streakCount,
      bestStreak,
      isPersonalBest: streakCount > 1 && streakCount === bestStreak,
      plantEmoji: plant.emoji,
      plantName: plant.name,
      debug,
    }
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    console.error('[stories/generate] Unhandled error:', err)
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }

  const cardElement = <StoryCard {...cardData} />

  try {
    const image = new ImageResponse(cardElement, { width: 1080, height: 1920, fonts })
    // Force the (otherwise lazy) Satori render here so a render failure surfaces
    // as a catchable 500 instead of crashing the serverless worker mid-stream
    // with an empty reply. ImageResponse renders during body streaming — i.e.
    // AFTER this function returns — so a try/catch around `new ImageResponse`
    // alone never catches render errors. Consuming the body forces it now.
    const buf = await image.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        // Owner-only and reflects live streak data → must not be cached.
        'cache-control': 'private, no-store, max-age=0',
      },
    })
  } catch (renderErr) {
    console.error('[stories/generate] Satori render error:', renderErr)
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
