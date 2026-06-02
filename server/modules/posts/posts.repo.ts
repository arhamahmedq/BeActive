import { PostStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import { toLocalDateStr } from '../../../shared/utils/timezone'
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

/**
 * Returns true if the user already has a PENDING or VERIFIED post for their
 * *local* calendar day, in the given IANA timezone.
 *
 * This must agree with the streak engine's notion of "today" — the streak
 * ledger keys completions on DailyCompletion.localDate (also derived from
 * toLocalDateStr). A UTC-day check here would disagree at every UTC offset:
 * it could wrongly block an evening user in a positive-offset zone from
 * logging a genuinely new local day (silently breaking their streak), or
 * wrongly allow a duplicate post within the same local day across the UTC
 * boundary in a negative-offset zone.
 *
 * Scans a 36h window (covers any IANA offset ±14h with margin) and filters by
 * the user's local date in JS — DST-safe and tiny (one user's recent posts).
 */
export async function hasActivePostForLocalDate(
  userId: string,
  timezone: string,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000)
  const posts = await prisma.post.findMany({
    where: {
      userId,
      status: { in: [PostStatus.PENDING, PostStatus.VERIFIED] },
      createdAt: { gte: since },
    },
    select: { createdAt: true },
  })
  const localToday = toLocalDateStr(now, timezone)
  return posts.some((p) => toLocalDateStr(p.createdAt, timezone) === localToday)
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
