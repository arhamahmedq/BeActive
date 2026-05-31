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

export async function markPostVerified(
  postId: string,
  result: ClassificationOutput
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: { status: PostStatus.VERIFIED },
    })
    const workout = await tx.workout.create({
      data: {
        postId,
        type: result.type as WorkoutType,
        aiConfidence: result.confidence,
        modelVersion: result.modelVersion,
      },
    })
    return workout.id
  })
}

export async function markPostRejected(postId: string): Promise<void> {
  await prisma.post.update({
    where: { id: postId },
    data: { status: PostStatus.REJECTED },
  })
}

export async function persistClassificationEvent(params: {
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
