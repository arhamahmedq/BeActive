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

export async function updateUserProfile(
  userId: string,
  data: UpdateProfileInput
): Promise<UserProfile> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.bio !== undefined && { bio: data.bio }),
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
