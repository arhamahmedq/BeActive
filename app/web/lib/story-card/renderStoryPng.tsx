import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { getObject } from '../storage/r2'
import { StoryCard, type StoryCardData } from './StoryCard'
import { loadStoryFonts } from './font'
import type { StoryPayload } from './types'

// ---------------------------------------------------------------------------
// Network-free story render — pure function of StoryPayload + the cached
// story-src/{postId}.jpg object in our own R2 bucket. No live DB lookups, no
// external (uncontrolled) HTTP fetches: the source photo comes from our own
// R2, the avatar is a small best-effort fetch with a null fallback, and fonts
// are bundled static TTFs (see font.ts).
//
// IMPORTANT: Satori (the @vercel/og engine) cannot decode WebP. Every image
// embedded into the card MUST be JPEG/PNG, or the render throws
// "u2 is not iterable" mid-stream. Both the source photo (encoded JPEG in the
// service) and the avatar (re-encoded to JPEG below) are normalized for this.
// ---------------------------------------------------------------------------

function toDataUri(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

async function fetchAvatarDataUri(avatarUrl: string | null): Promise<string | null> {
  if (!avatarUrl) return null
  try {
    const res = await fetch(avatarUrl)
    if (!res.ok) return null
    const raw = Buffer.from(await res.arrayBuffer())
    // Re-encode to JPEG so a WebP (or any Satori-incompatible) avatar can never
    // crash the render. Failure here falls through to a null avatar.
    const jpeg = await sharp(raw).resize(160, 160, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    return toDataUri(jpeg, 'image/jpeg')
  } catch {
    return null
  }
}

export async function renderStoryPng(payload: StoryPayload): Promise<Buffer> {
  const [{ buffer: srcBuffer, contentType: srcContentType }, avatarDataUri, fonts] = await Promise.all([
    getObject(payload.storySrcKey),
    fetchAvatarDataUri(payload.avatarUrl),
    loadStoryFonts(),
  ])

  const cardData: StoryCardData = {
    imageUrl: toDataUri(srcBuffer, srcContentType),
    avatarUrl: avatarDataUri,
    username: payload.username,
    workoutLabel: payload.workoutLabel,
    workoutType: payload.workoutType,
    streakCount: payload.streakCount,
    bestStreak: payload.bestStreak,
    isPersonalBest: payload.isPersonalBest,
    plant: payload.plant,
    plantName: payload.plantName,
  }

  const cardElement = <StoryCard {...cardData} />

  // ImageResponse renders LAZILY during body streaming (after this function
  // would otherwise return), so a render failure must be forced via
  // arrayBuffer() to surface here as a catchable error instead of crashing
  // the caller mid-stream — same pattern as app/api/stories/generate/route.tsx.
  const image = new ImageResponse(cardElement, { width: 1080, height: 1920, fonts })
  const buf = await image.arrayBuffer()
  return Buffer.from(buf)
}
