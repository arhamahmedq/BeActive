import { StreakStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { StreakState } from './streaks.types'

export async function getUserTimezone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  return user?.timezone ?? null
}

/** Inserts a DailyCompletion row. Returns false on duplicate (same userId + localDate). */
export async function createDailyCompletion(params: {
  userId: string
  localDate: string
  postId: string
  timezone: string
}): Promise<boolean> {
  try {
    await prisma.dailyCompletion.create({ data: params })
    return true
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false
    }
    throw err
  }
}

export async function getCompletionsForUser(
  userId: string
): Promise<Array<{ localDate: string }>> {
  return prisma.dailyCompletion.findMany({
    where: { userId },
    select: { localDate: true },
    orderBy: { localDate: 'asc' },
  })
}

export async function hasDailyCompletion(userId: string, localDate: string): Promise<boolean> {
  const row = await prisma.dailyCompletion.findUnique({
    where: { userId_localDate: { userId, localDate } },
    select: { id: true },
  })
  return row !== null
}

export async function getStreakByUserId(userId: string): Promise<StreakState | null> {
  return prisma.streak.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      current: true,
      best: true,
      status: true,
      lastVerifiedDate: true,
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
    lastVerifiedDate?: string | null
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

export interface StreakV2ForEvaluation {
  id: string
  userId: string
  current: number
  status: StreakStatus
  lastVerifiedDate: string | null
  user: { timezone: string }
}

export async function getActiveStreaksV2ForEvaluation(): Promise<StreakV2ForEvaluation[]> {
  return prisma.streak.findMany({
    where: { status: StreakStatus.ACTIVE },
    select: {
      id: true,
      userId: true,
      current: true,
      status: true,
      lastVerifiedDate: true,
      user: { select: { timezone: true } },
    },
  })
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
