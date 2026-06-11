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
import { putObject, objectExists, buildPublicUrl } from '@/lib/storage/r2'
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
    storySrcKey: `story-src/${postId}.webp`,
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
    const resized = await sharp(sourceBuf)
      .resize(STORY_SRC_WIDTH, STORY_SRC_HEIGHT, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()
    await putObject(payload.storySrcKey, resized, 'image/webp', 'private, max-age=31536000, immutable')

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
): Promise<{ kind: 'redirect'; url: string } | { kind: 'buffer'; buffer: Buffer; contentType: string }> {
  await assertOwnedVerifiedPost(postId, userId)

  const story = await getStoryByPostId(postId)
  if (story?.status === 'READY' && story.assetKey && story.assetUrl && (await objectExists(story.assetKey))) {
    return { kind: 'redirect', url: story.assetUrl }
  }

  const buffer = await generateAndPersistStory(postId, userId)
  return { kind: 'buffer', buffer, contentType: 'image/png' }
}
