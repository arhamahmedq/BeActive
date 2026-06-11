// Stories service — Story Sharing V3 core pipeline.
//
// buildStoryPayload() snapshots an immutable StoryPayload at WORKOUT_VERIFIED
// time. generateAndPersistStory() renders that payload to PNG (network-free,
// against our own R2 objects) and persists both the resized source photo and
// the rendered card to R2. getOrRenderStory() is the cache-aside read path:
// serve the cached asset when ready, else render on demand.

import sharp from 'sharp'
import { getPost } from '../posts/posts.service'
import { getMyStreak } from '../streaks/streaks.service'
import { getPlant, WORKOUT_LABELS } from '@/lib/story-card/constants'
import { renderStoryPng } from '@/lib/story-card/renderStoryPng'
import { putObject, getObject, objectExists, buildPublicUrl } from '@/lib/storage/r2'
import { getStoryByPostId, upsertPendingStory, markStoryReady, markStoryFailed } from './stories.repo'
import { NotFoundError } from '../../core/errors/AppError'
import type { StoryPayload } from './stories.types'

const STORY_SRC_WIDTH = 936
const STORY_SRC_HEIGHT = 620

async function assertOwnedVerifiedPost(postId: string, userId: string) {
  const post = await getPost(userId, postId)
  if (post.user?.id !== userId) throw new NotFoundError('Post')
  if (post.status !== 'VERIFIED') throw new NotFoundError('Post')
  return post
}

export async function buildStoryPayload(postId: string, userId: string): Promise<StoryPayload> {
  const post = await assertOwnedVerifiedPost(postId, userId)
  const streak = await getMyStreak(userId)

  const streakCount = streak?.current ?? 0
  const bestStreak = streak?.best ?? 0
  const plant = getPlant(streakCount)
  const workoutType = post.workout?.type ?? 'OTHER'

  return {
    postId,
    userId,
    shareVersion: 1,
    storySrcKey: `story-src/${postId}.jpg`,
    username: post.user?.username ?? '',
    avatarUrl: post.user?.avatarUrl ?? null,
    workoutType,
    workoutLabel: WORKOUT_LABELS[workoutType] ?? 'WORKOUT',
    streakCount,
    bestStreak,
    isPersonalBest: streakCount > 1 && streakCount === bestStreak,
    plant: { level: plant.level, color: plant.color, bgColor: plant.bgColor, borderColor: plant.borderColor },
    plantName: plant.name,
    createdAt: new Date().toISOString(),
  }
}

export async function generateAndPersistStory(postId: string, userId: string): Promise<Buffer> {
  const startedAt = Date.now()

  const existing = await getStoryByPostId(postId)
  const payload = await buildStoryPayload(postId, userId)
  if (existing) payload.shareVersion = existing.shareVersion

  const { id: storyId } = await upsertPendingStory(postId, userId, payload, payload.shareVersion)

  try {
    const post = await getPost(userId, postId)
    const sourceRes = await fetch(post.imageUrl)
    if (!sourceRes.ok) throw new Error(`source photo fetch failed: HTTP ${sourceRes.status}`)
    const sourceBuf = Buffer.from(await sourceRes.arrayBuffer())
    // Satori (the @vercel/og render engine) cannot decode WebP — embedding a
    // WebP data URI throws "u2 is not iterable" mid-render. Encode the cached
    // source as JPEG, which Satori decodes reliably.
    const resized = await sharp(sourceBuf)
      .resize(STORY_SRC_WIDTH, STORY_SRC_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer()
    await putObject(payload.storySrcKey, resized, 'image/jpeg', 'private, max-age=31536000, immutable')

    const png = await renderStoryPng(payload)
    const assetKey = `stories/${postId}/${payload.shareVersion}.png`
    await putObject(assetKey, png, 'image/png', 'public, max-age=31536000, immutable')

    await markStoryReady(storyId, {
      assetKey,
      assetUrl: buildPublicUrl(assetKey),
      renderMs: Date.now() - startedAt,
    })

    return png
  } catch (err) {
    await markStoryFailed(storyId, String(err)).catch(() => {})
    throw err
  }
}

export async function getOrRenderStory(
  postId: string,
  userId: string
): Promise<{ buffer: Buffer; contentType: string }> {
  await assertOwnedVerifiedPost(postId, userId)

  // Warm path: serve the cached PNG by reading it back from R2 and returning
  // the bytes SAME-ORIGIN. We deliberately do NOT 302-redirect to the public
  // r2.dev URL — the share button reads the response via fetch().blob(), and a
  // cross-origin redirect to r2.dev (which sends no Access-Control-Allow-Origin
  // and 403s preflight) is blocked by the browser's CORS check. Proxying the
  // bytes keeps the response same-origin; R2->Vercel egress is free.
  const story = await getStoryByPostId(postId)
  if (story?.status === 'READY' && story.assetKey && (await objectExists(story.assetKey))) {
    return getObject(story.assetKey)
  }

  const buffer = await generateAndPersistStory(postId, userId)
  return { buffer, contentType: 'image/png' }
}
