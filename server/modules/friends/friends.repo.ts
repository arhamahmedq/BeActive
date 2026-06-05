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

// Directional lookup of the single row for an ordered (userAId, userBId) pair via
// the @@unique([userAId, userBId]) index. Unlike findFriendshipBetween (which ORs
// both directions and can return either of two rows when a mutual block exists),
// this resolves exactly one direction — required for block/unblock correctness.
export async function findDirectedFriendship(
  userAId: string,
  userBId: string
): Promise<FriendshipRecord | null> {
  return prisma.friendship.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
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

// Block is directional. It drops the blocker's own relationship with the target
// (its row in either direction, ANY status) plus the target's non-block relationship
// toward the blocker — but NEVER the target's own BLOCKED row. That preserves a
// mutual block: A blocking B must not erase B's prior block of A (which would let A
// re-reach B once A later unblocks). Then it creates the (blocker → blocked) BLOCKED
// row. Atomic via transaction.
export async function blockFriendship(
  blockerId: string,
  blockedId: string
): Promise<FriendshipRecord> {
  return prisma.$transaction(async (tx) => {
    await tx.friendship.deleteMany({
      where: {
        OR: [
          // blocker's own row to the target (a request the blocker sent, or a friendship)
          { userAId: blockerId, userBId: blockedId },
          // target's relationship toward the blocker — but leave their BLOCKED row intact
          { userAId: blockedId, userBId: blockerId, status: { not: FriendshipStatus.BLOCKED } },
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
