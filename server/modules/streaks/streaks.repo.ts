import { StreakStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { StreakState } from './streaks.types'

// A query runner that is either the singleton client or a transaction client.
// Threading this through every repo lets the verify→streak flow execute as ONE
// atomic transaction (callers pass `tx`); standalone callers get the default.
type Db = Prisma.TransactionClient | typeof prisma

export async function getUserTimezone(userId: string, db: Db = prisma): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })
  return user?.timezone ?? null
}

/**
 * Inserts a DailyCompletion row. Does NOT swallow the UNIQUE(userId, localDate)
 * violation: inside a transaction a caught constraint error would leave the
 * transaction in an aborted state, so a P2002 here must propagate and roll the
 * whole transaction back. Same-day idempotency is enforced upstream by the
 * monotonic localDate gate in streaks.service; this constraint is the final
 * backstop against a concurrent double-credit race.
 */
export async function createDailyCompletion(
  params: { userId: string; localDate: string; postId: string; timezone: string },
  db: Db = prisma
): Promise<void> {
  await db.dailyCompletion.create({ data: params })
}

export async function getCompletionsForUser(
  userId: string,
  db: Db = prisma
): Promise<Array<{ localDate: string }>> {
  return db.dailyCompletion.findMany({
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

export async function getStreakByUserId(
  userId: string,
  db: Db = prisma
): Promise<StreakState | null> {
  return db.streak.findUnique({
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
  },
  db: Db = prisma
): Promise<void> {
  await db.streak.update({
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

export async function persistStreakEvent(
  params: {
    type: string
    userId: string
    payload: Record<string, unknown>
    source: string
    correlationId?: string
  },
  db: Db = prisma
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

export async function getPostCreatedAt(postId: string, db: Db = prisma): Promise<Date | null> {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { createdAt: true },
  })
  return post?.createdAt ?? null
}
