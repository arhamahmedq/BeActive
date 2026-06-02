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
