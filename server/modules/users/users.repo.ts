import { PostStatus, FriendshipStatus } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { UserProfile, UpdateProfileInput, ProfileUserRow, ProfilePostRow } from './users.types'

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

// --- Public profile (Slice 8A) ---

export async function getUserByUsername(username: string): Promise<ProfileUserRow | null> {
  return prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      streak: { select: { current: true, best: true } },
    },
  })
}

export async function getFriendCount(userId: string): Promise<number> {
  return prisma.friendship.count({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  })
}

export async function getVerifiedPostCount(userId: string): Promise<number> {
  return prisma.post.count({ where: { userId, status: PostStatus.VERIFIED } })
}

// Keyset pagination on (createdAt DESC, id DESC) — stable, no offset (per data
// rules). Returns up to `limit + 1` rows so the caller can derive nextCursor.
export async function getUserVerifiedPosts(
  userId: string,
  cursor: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<ProfilePostRow[]> {
  return prisma.post.findMany({
    where: {
      userId,
      status: PostStatus.VERIFIED,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      createdAt: true,
      workout: { select: { type: true } },
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
