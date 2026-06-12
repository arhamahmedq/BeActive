import { PostStatus, WorkoutType, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { ClassificationOutput } from './ai.types'

export interface PostForClassification {
  id: string
  status: PostStatus
  imageUrl: string
  userId: string
}

export async function findPostForClassification(
  postId: string
): Promise<PostForClassification | null> {
  return prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true, imageUrl: true, userId: true },
  })
}

export interface StalePendingPost {
  id: string
  imageUrl: string
  userId: string
  createdAt: Date
}

// Posts left in PENDING past `olderThan` — the after()-based classification
// trigger never ran or was killed mid-flight. Oldest first so a backlog drains
// in submission order.
export async function findStalePendingPosts(
  olderThan: Date,
  limit: number
): Promise<StalePendingPost[]> {
  return prisma.post.findMany({
    where: { status: PostStatus.PENDING, createdAt: { lt: olderThan } },
    select: { id: true, imageUrl: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
}

// Runs on whatever client is passed: in the verify flow this is the SHARED
// transaction client (`tx`) so the Post→VERIFIED flip and the Workout row commit
// atomically with the streak update. Callers in the verify path MUST pass `tx`.
export async function markPostVerified(
  postId: string,
  result: ClassificationOutput,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  await db.post.update({
    where: { id: postId },
    data: { status: PostStatus.VERIFIED },
  })
  const workout = await db.workout.create({
    data: {
      postId,
      type: result.type as WorkoutType,
      aiConfidence: result.confidence,
      modelVersion: result.modelVersion,
    },
  })
  return workout.id
}

export async function markPostRejected(postId: string): Promise<void> {
  await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.REJECTED },
  })
}

// Poison-post cap (H1): bumped every time classifyWithRetry exhausts its
// retries for this post. Returns the new total so the caller can compare
// against CLASSIFICATION_GIVEUP_THRESHOLD.
export async function incrementClassificationAttempts(postId: string): Promise<number> {
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { classificationAttempts: { increment: 1 } },
    select: { classificationAttempts: true },
  })
  return updated.classificationAttempts
}

export async function persistClassificationEvent(
  params: {
    type: string
    userId: string
    payload: Record<string, unknown>
    source: string
    correlationId?: string
  },
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await db.event.create({
    data: {
      type: params.type,
      userId: params.userId,
      payload: params.payload as Prisma.InputJsonValue,
      source: params.source,
      correlationId: params.correlationId ?? null,
    },
  })
}
