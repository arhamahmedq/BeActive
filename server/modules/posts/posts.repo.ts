import { PostStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { PostResponse } from './posts.types'

const postSelect = {
  id: true,
  imageUrl: true,
  imageKey: true,
  caption: true,
  status: true,
  createdAt: true,
}

const postWithUserSelect = {
  ...postSelect,
  user: {
    select: { id: true, username: true, avatarUrl: true },
  },
  workout: {
    select: { type: true, aiConfidence: true },
  },
}

export async function createPost(params: {
  userId: string
  imageKey: string
  imageUrl: string
  caption?: string
}): Promise<PostResponse> {
  const post = await prisma.post.create({
    data: {
      userId: params.userId,
      imageKey: params.imageKey,
      imageUrl: params.imageUrl,
      caption: params.caption ?? null,
      status: PostStatus.PENDING,
    },
    select: postSelect,
  })
  return { ...post, status: post.status as string }
}

export async function findPostById(postId: string): Promise<PostResponse | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: postWithUserSelect,
  })
  if (!post) return null
  return {
    ...post,
    status: post.status as string,
    workout: post.workout
      ? { type: post.workout.type as string, aiConfidence: post.workout.aiConfidence }
      : null,
  }
}

export async function hasPendingOrVerifiedPostToday(userId: string): Promise<boolean> {
  const startOfUtcDay = new Date()
  startOfUtcDay.setUTCHours(0, 0, 0, 0)

  const count = await prisma.post.count({
    where: {
      userId,
      status: { in: [PostStatus.PENDING, PostStatus.VERIFIED] },
      createdAt: { gte: startOfUtcDay },
    },
  })
  return count > 0
}

export async function persistEvent(params: {
  type: string
  userId: string
  payload: Record<string, unknown>
  source: string
  correlationId?: string
}): Promise<void> {
  await prisma.event.create({
    data: {
      type: params.type,
      userId: params.userId,
      payload: params.payload as Prisma.InputJsonValue,
      source: params.source,
      correlationId: params.correlationId ?? null,
    },
  })
}
