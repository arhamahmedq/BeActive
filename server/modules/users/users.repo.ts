import { prisma } from '../../../app/web/lib/prisma'
import type { UserProfile, UpdateProfileInput } from './users.types'

export async function getUserById(userId: string): Promise<UserProfile | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      timezone: true,
      onboarded: true,
      createdAt: true,
    },
  })
}

/** Current state of the timezone-change throttle window for a user. */
export async function getTimezoneThrottleState(
  userId: string
): Promise<{ tzChangedAt: Date | null; tzChangeCount: number } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { tzChangedAt: true, tzChangeCount: true },
  })
}

export async function updateUserProfile(
  userId: string,
  data: UpdateProfileInput,
  // Optional throttle bookkeeping — set only when the timezone actually changes.
  throttle?: { tzChangedAt: Date; tzChangeCount: number }
): Promise<UserProfile> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(throttle && { tzChangedAt: throttle.tzChangedAt, tzChangeCount: throttle.tzChangeCount }),
      onboarded: true,
    },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      timezone: true,
      onboarded: true,
      createdAt: true,
    },
  })
}

export async function getAllUsersForTimezoneAudit(): Promise<
  Array<{ id: string; username: string; timezone: string }>
> {
  return prisma.user.findMany({
    select: { id: true, username: true, timezone: true },
    orderBy: { createdAt: 'asc' },
  })
}
