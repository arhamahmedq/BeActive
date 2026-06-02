import { StreakStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { AuthUser } from './auth.types'

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  timezone: true,
  onboarded: true,
  createdAt: true,
} as const

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: USER_SELECT,
  })
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  return prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  })
}

export async function findUserByUsername(username: string): Promise<AuthUser | null> {
  return prisma.user.findUnique({
    where: { username },
    select: USER_SELECT,
  })
}

// Retained for future OAuth flows. Prefer createUserWithStreak for email/password signups.
export async function createUser(params: {
  id: string
  email: string
  username: string
}): Promise<AuthUser> {
  return prisma.user.create({
    data: {
      id: params.id,
      email: params.email,
      username: params.username,
    },
    select: USER_SELECT,
  })
}

export async function createDefaultStreak(userId: string): Promise<void> {
  await prisma.streak.create({
    data: { userId, current: 0, best: 0, status: StreakStatus.INACTIVE },
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
      },
      select: USER_SELECT,
    })
    await tx.streak.create({
      data: { userId: user.id, current: 0, best: 0, status: StreakStatus.INACTIVE },
    })
    return user
  })
}
