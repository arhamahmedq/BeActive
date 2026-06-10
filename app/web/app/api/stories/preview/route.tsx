import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { StoryCard, type StoryCardData } from '@/lib/story-card/StoryCard'
import { getPlant, WORKOUT_LABELS, WORKOUT_ICONS } from '@/lib/story-card/constants'
import { loadStoryFonts, type StoryFont } from '@/lib/story-card/font'

// ---------------------------------------------------------------------------
// DEV-ONLY story-card preview — renders the real StoryCard template with mock
// data and a bundled sample photo, with NO auth and NO database. This is how we
// verify Instagram safe areas, typography, and layout for edge cases without
// having to upload + AI-verify a real workout.
//
// 404s in production. Query params let you exercise the layout:
//   ?debug=safe         overlay the IG unsafe zones + safe band
//   ?streak=128&best=128  3-digit + personal-best ("NEW") state
//   ?type=RUNNING       workout type (GYM|RUNNING|CYCLING|SWIMMING|OUTDOOR|SPORTS|OTHER)
//   ?username=longname  identity chip
//   ?noavatar=1         avatar fallback (initial)
//   ?plantdays=400      force a plant tier independent of streak
// ---------------------------------------------------------------------------

// Sniff the real image type from magic bytes — never trust the file extension.
// (The repo's rugby.jpeg is actually a WebP; mislabeling it image/jpeg made
// Satori run the JPEG parser on WebP bytes and read out of bounds.)
function sniffMime(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  return 'image/jpeg'
}

// Read the sample image straight off disk (NOT via an HTTP self-fetch — fetching
// the dev server's own origin while it is busy serving this request can deadlock
// the worker and yield an "empty reply from server").
async function publicImageDataUri(fileName: string): Promise<string> {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '')
  const buf = await readFile(join(process.cwd(), 'public', safe))
  return `data:${sniffMime(buf)};base64,${Buffer.from(buf).toString('base64')}`
}

export async function GET(request: NextRequest): Promise<ImageResponse | NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, cwd: process.cwd(), node: process.version })
  }
  const streakCount = Number(searchParams.get('streak') ?? '12')
  const bestStreak = Number(searchParams.get('best') ?? '14')
  const workoutType = (searchParams.get('type') ?? 'GYM').toUpperCase()
  const username = searchParams.get('username') ?? 'arhamfit'
  const noAvatar = searchParams.get('noavatar') === '1'
  const debug = searchParams.get('debug') === 'safe'
  const igChrome = searchParams.get('debug') === 'ig'
  const plantDays = Number(searchParams.get('plantdays') ?? String(streakCount))
  const sampleImage = searchParams.get('img') ?? 'sample-workout.jpg'

  let fonts: StoryFont[] = []
  let cardData: StoryCardData
  try {
    const [imageUri, loadedFonts] = await Promise.all([publicImageDataUri(sampleImage), loadStoryFonts()])
    fonts = searchParams.get('nofont') === '1' ? [] : loadedFonts
    const plant = getPlant(plantDays)
    cardData = {
      imageUrl: imageUri,
      avatarUrl: noAvatar ? null : imageUri,
      username,
      workoutLabel: WORKOUT_LABELS[workoutType] ?? 'WORKOUT',
      workoutIcon: WORKOUT_ICONS[workoutType] ?? '💪',
      streakCount,
      bestStreak,
      isPersonalBest: searchParams.get('pb') === '1' || (streakCount > 1 && streakCount === bestStreak),
      plantEmoji: plant.emoji,
      plantName: plant.name,
      debug,
      igChrome,
    }
  } catch (err) {
    console.error('[stories/preview] error:', err)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: String(err) } }, { status: 500 })
  }

  const cardElement = <StoryCard {...cardData} />

  try {
    const img = new ImageResponse(cardElement, { width: 1080, height: 1920, fonts })
    // Force the (otherwise lazy) Satori render NOW so render errors are catchable
    // here instead of crashing the worker mid-stream with an empty reply.
    const buf = await img.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    })
  } catch (renderErr) {
    console.error('[stories/preview] render error:', renderErr)
    return NextResponse.json(
      { error: { code: 'RENDER_ERROR', message: String(renderErr instanceof Error ? renderErr.stack ?? renderErr.message : renderErr) } },
      { status: 500 }
    )
  }
}
