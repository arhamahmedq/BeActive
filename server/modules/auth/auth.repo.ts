import { UserActivityState, StreakStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { AuthUser } from './auth.types'

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      activityState: true,
      onboarded: true,
      createdAt: true,
    },
  })
  if (!user) return null
  return { ...user, activityState: user.activityState as string }
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      activityState: true,
      onboarded: true,
      createdAt: true,
    },
  })
  if (!user) return null
  return { ...user, activityState: user.activityState as string }
}

export async function findUserByUsername(username: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      activityState: true,
      onboarded: true,
      createdAt: true,
    },
  })
  if (!user) return null
  return { ...user, activityState: user.activityState as string }
}

// Retained for future OAuth flows where user + streak may be created separately.
// Prefer createUserWithStreak for all email/password signups (atomic transaction).
export async function createUser(params: {
  id: string
  email: string
  username: string
}): Promise<AuthUser> {
  const user = await prisma.user.create({
    data: {
      id: params.id,
      email: params.email,
      username: params.username,
      activityState: UserActivityState.ACTIVE,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      activityState: true,
      onboarded: true,
      createdAt: true,
    },
  })
  return { ...user, activityState: user.activityState as string }
}

export async function createDefaultStreak(userId: string): Promise<void> {
  await prisma.streak.create({
    data: {
      userId,
      current: 0,
      best: 0,
      status: StreakStatus.INACTIVE,
    },
  })
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

export async function createUserWithStreak(params: {
  id: string
  email: string
  username: string
}): Promise<AuthUser> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: params.id,
        email: params.email.toLowerCase(),
        username: params.username.toLowerCase(),
        activityState: UserActivityState.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        activityState: true,
        onboarded: true,
        createdAt: true,
      },
    })
    await tx.streak.create({
      data: {
        userId: user.id,
        current: 0,
        best: 0,
        status: StreakStatus.INACTIVE,
      },
    })
    return { ...user, activityState: user.activityState as string }
  })
}
