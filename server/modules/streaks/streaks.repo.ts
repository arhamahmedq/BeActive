import { StreakStatus, UserActivityState, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { StreakState, StreakWithUserActivity } from './streaks.types'

export async function getStreakByUserId(userId: string): Promise<StreakState | null> {
  return prisma.streak.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      current: true,
      best: true,
      status: true,
      lastVerifiedAt: true,
      brokenAt: true,
    },
  })
}

export async function updateStreak(
  userId: string,
  data: {
    current: number
    best: number
    status: StreakStatus
    lastVerifiedAt: Date
    brokenAt?: Date | null
  }
): Promise<void> {
  await prisma.streak.update({
    where: { userId },
    data,
  })
}

export async function markStreakBroken(userId: string, brokenAt: Date): Promise<void> {
  await prisma.streak.update({
    where: { userId },
    data: { status: StreakStatus.BROKEN, brokenAt },
  })
}

export async function getActiveStreaksForEvaluation(): Promise<StreakWithUserActivity[]> {
  const rows = await prisma.streak.findMany({
    where: { status: StreakStatus.ACTIVE, lastVerifiedAt: { not: null } },
    select: {
      id: true,
      userId: true,
      current: true,
      status: true,
      lastVerifiedAt: true,
      user: { select: { activityState: true } },
    },
  })
  return rows as unknown as StreakWithUserActivity[]
}

export async function persistStreakEvent(params: {
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

export async function getPostCreatedAt(postId: string): Promise<Date | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { createdAt: true },
  })
  return post?.createdAt ?? null
}
