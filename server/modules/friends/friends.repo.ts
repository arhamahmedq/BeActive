import { FriendshipStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { FriendshipRecord, FriendRowData, PendingRowData } from './friends.types'

const friendshipSelect = {
  id: true,
  userAId: true,
  userBId: true,
  status: true,
  createdAt: true,
} as const

// ---------------------------------------------------------------------------
// Existing — used by the feed pipeline (Slice 5)
// ---------------------------------------------------------------------------

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })
  const ids = new Set<string>()
  for (const r of rows) ids.add(r.userAId === userId ? r.userBId : r.userAId)
  ids.delete(userId) // belt-and-suspenders: never include self
  return [...ids]
}

// ---------------------------------------------------------------------------
// New — Slice 6 friendship management
// ---------------------------------------------------------------------------

export async function findFriendshipBetween(
  userId1: string,
  userId2: string
): Promise<FriendshipRecord | null> {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: userId1, userBId: userId2 },
        { userAId: userId2, userBId: userId1 },
      ],
    },
    select: friendshipSelect,
  })
}

export async function findFriendshipById(id: string): Promise<FriendshipRecord | null> {
  return prisma.friendship.findUnique({
    where: { id },
    select: friendshipSelect,
  })
}

export async function createFriendship(
  userAId: string,
  userBId: string
): Promise<FriendshipRecord> {
  return prisma.friendship.create({
    data: { userAId, userBId, status: FriendshipStatus.PENDING },
    select: friendshipSelect,
  })
}

export async function updateFriendshipStatus(
  id: string,
  status: FriendshipStatus
): Promise<FriendshipRecord> {
  return prisma.friendship.update({
    where: { id },
    data: { status },
    select: friendshipSelect,
  })
}

export async function deleteFriendship(id: string): Promise<void> {
  await prisma.friendship.delete({ where: { id } })
}

// Block is destructive-and-create: any existing relationship (either direction,
// PENDING or ACCEPTED) is dropped and replaced by a single BLOCKED row whose
// direction encodes the blocker (userAId) → blocked (userBId). Wrapped in a
// transaction so the delete + create are atomic. deleteMany (not delete) tolerates
// 0, 1, or — defensively — duplicate rows for the pair.
export async function blockFriendship(
  blockerId: string,
  blockedId: string
): Promise<FriendshipRecord> {
  return prisma.$transaction(async (tx) => {
    await tx.friendship.deleteMany({
      where: {
        OR: [
          { userAId: blockerId, userBId: blockedId },
          { userAId: blockedId, userBId: blockerId },
        ],
      },
    })
    return tx.friendship.create({
      data: { userAId: blockerId, userBId: blockedId, status: FriendshipStatus.BLOCKED },
      select: friendshipSelect,
    })
  })
}

export async function getAcceptedFriends(userId: string): Promise<FriendRowData[]> {
  return prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          streak: { select: { current: true } },
        },
      },
      userB: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          streak: { select: { current: true } },
        },
      },
    },
  })
}

export async function getPendingFriendships(userId: string): Promise<PendingRowData[]> {
  return prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.PENDING,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      userA: { select: { id: true, username: true, avatarUrl: true } },
      userB: { select: { id: true, username: true, avatarUrl: true } },
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

// ---------------------------------------------------------------------------
// searchUsers — blocked-user exclusion is mandatory security; do not remove the AND block.
//   friendshipsA covers rows where the result user is userAId (they sent a block to requester)
//   friendshipsB covers rows where the result user is userBId (requester sent a block to them)
//   take: 20 is a hard cap — never removed.
export async function searchUsers(
  query: string,
  requesterId: string
): Promise<Array<{ id: string; username: string; avatarUrl: string | null }>> {
  return prisma.user.findMany({
    where: {
      username: { contains: query, mode: 'insensitive' },
      id: { not: requesterId },
      AND: [
        { friendshipsA: { none: { userBId: requesterId, status: FriendshipStatus.BLOCKED } } },
        { friendshipsB: { none: { userAId: requesterId, status: FriendshipStatus.BLOCKED } } },
      ],
    },
    select: { id: true, username: true, avatarUrl: true },
    take: 20,
  })
}
