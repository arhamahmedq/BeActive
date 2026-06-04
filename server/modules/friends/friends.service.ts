import { FriendshipStatus, NotificationType } from '@prisma/client'
import * as friendsRepo from './friends.repo'
import { getProfile } from '../users/users.service'
import { createNotification } from '../notifications/notifications.service'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError'
import { isUniqueConstraintError } from '../../core/errors/prismaErrors'
import type { FriendshipRecord } from './friends.types'
import type {
  FriendsListResponse,
  PendingFriendsResponse,
  FriendshipMutationResponse,
  FriendUser,
  PendingFriendEntry,
  UserSearchResponse,
} from '../../../shared/types/friends'

// ---------------------------------------------------------------------------
// Existing — used by the feed pipeline (Slice 5)
// ---------------------------------------------------------------------------

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  return friendsRepo.getAcceptedFriendIds(userId)
}

// ---------------------------------------------------------------------------
// Slice 6 — friendship management
// ---------------------------------------------------------------------------

export async function sendFriendRequest(
  requesterId: string,
  targetUserId: string
): Promise<FriendshipMutationResponse> {
  if (requesterId === targetUserId) {
    throw new ConflictError('You cannot send a friend request to yourself')
  }

  // Fetch both profiles concurrently:
  //   getProfile(targetUserId) — validates target exists (throws NotFoundError → 404 before any write)
  //   getProfile(requesterId)  — provides username for the FRIEND_REQUEST notification title
  const [requesterProfile] = await Promise.all([
    getProfile(requesterId),
    getProfile(targetUserId),
  ])

  const existing = await friendsRepo.findFriendshipBetween(requesterId, targetUserId)
  if (existing) {
    throw new ConflictError('A friend request or friendship already exists between these users')
  }

  // Convention: userAId = requester, userBId = recipient — enforced here, never elsewhere.
  let friendship: FriendshipRecord
  try {
    friendship = await friendsRepo.createFriendship(requesterId, targetUserId)
  } catch (err) {
    // Race guard: two identical requests can both pass findFriendshipBetween above,
    // then the @@unique([userAId, userBId]) constraint rejects the second insert.
    // Map that to the same 409 the pre-check returns instead of a leaked 500.
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('A friend request or friendship already exists between these users')
    }
    throw err
  }

  void friendsRepo.persistEvent({
    type: EventType.FRIEND_REQUEST_SENT,
    userId: requesterId,
    payload: { friendshipId: friendship.id, fromUserId: requesterId, toUserId: targetUserId },
    source: 'friends.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist FRIEND_REQUEST_SENT event', { error: String(err) })
  })

  void createNotification({
    userId: targetUserId,
    type: NotificationType.FRIEND_REQUEST,
    title: `@${requesterProfile.username} wants to be friends`,
    data: { friendshipId: friendship.id, fromUserId: requesterId },
    idempotencyKey: `friendship:${friendship.id}:FRIEND_REQUEST`,
  }).catch((err: unknown) => {
    logger.error('Failed to create FRIEND_REQUEST notification', { error: String(err) })
  })

  return { friendship: { id: friendship.id, status: friendship.status } }
}

export async function acceptFriendRequest(
  userId: string,
  friendshipId: string
): Promise<FriendshipMutationResponse> {
  const friendship = await friendsRepo.findFriendshipById(friendshipId)
  if (!friendship) throw new NotFoundError('Friend request')

  // Only the recipient (userBId) can accept
  if (friendship.userBId !== userId) throw new ForbiddenError()

  if (friendship.status !== FriendshipStatus.PENDING) {
    throw new ConflictError('This friend request is no longer pending')
  }

  // Fetch acceptor profile for the FRIEND_ACCEPTED notification title.
  // userId is the authenticated caller — their profile is guaranteed to exist.
  const acceptorProfile = await getProfile(userId)

  const updated = await friendsRepo.updateFriendshipStatus(friendshipId, FriendshipStatus.ACCEPTED)

  void friendsRepo.persistEvent({
    type: EventType.FRIEND_REQUEST_ACCEPTED,
    userId,
    payload: { friendshipId, userAId: friendship.userAId, userBId: friendship.userBId },
    source: 'friends.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist FRIEND_REQUEST_ACCEPTED event', { error: String(err) })
  })

  void createNotification({
    userId: friendship.userAId,
    type: NotificationType.FRIEND_ACCEPTED,
    title: `@${acceptorProfile.username} accepted your friend request`,
    data: { friendshipId },
    idempotencyKey: `friendship:${friendshipId}:FRIEND_ACCEPTED`,
  }).catch((err: unknown) => {
    logger.error('Failed to create FRIEND_ACCEPTED notification', { error: String(err) })
  })

  return { friendship: { id: updated.id, status: updated.status } }
}

export async function rejectFriendRequest(userId: string, friendshipId: string): Promise<void> {
  const friendship = await friendsRepo.findFriendshipById(friendshipId)
  if (!friendship) throw new NotFoundError('Friend request')

  // Only the recipient (userBId) can reject
  if (friendship.userBId !== userId) throw new ForbiddenError()

  if (friendship.status !== FriendshipStatus.PENDING) {
    throw new ConflictError('This friend request is no longer pending')
  }

  await friendsRepo.deleteFriendship(friendshipId)
  // Rejection is silent — no event emitted
}

export async function removeFriend(userId: string, friendshipId: string): Promise<void> {
  const friendship = await friendsRepo.findFriendshipById(friendshipId)
  if (!friendship) throw new NotFoundError('Friendship')

  const isParticipant = friendship.userAId === userId || friendship.userBId === userId
  if (!isParticipant) throw new ForbiddenError()

  // For PENDING rows: only the requester (userAId) may cancel — recipient must use reject
  if (friendship.status === FriendshipStatus.PENDING && friendship.userAId !== userId) {
    throw new ForbiddenError()
  }

  await friendsRepo.deleteFriendship(friendshipId)

  // FRIEND_REMOVED only fires for ACCEPTED friendships — cancelling a pending request is silent
  if (friendship.status === FriendshipStatus.ACCEPTED) {
    void friendsRepo.persistEvent({
      type: EventType.FRIEND_REMOVED,
      userId,
      payload: { friendshipId, removedBy: userId },
      source: 'friends.service',
    }).catch((err: unknown) => {
      logger.error('Failed to persist FRIEND_REMOVED event', { error: String(err) })
    })
  }
}

export async function blockUser(
  userId: string,
  targetUserId: string
): Promise<FriendshipMutationResponse> {
  if (userId === targetUserId) {
    throw new ConflictError('You cannot block yourself')
  }

  // Validate the target exists before any write (throws NotFoundError → 404).
  await getProfile(targetUserId)

  // Replaces any existing friendship/request with a BLOCKED row (userA = blocker).
  // Once present, searchUsers excludes the pair (both directions) and the pull-model
  // feed/friends list never surface blocked users — they only read ACCEPTED rows.
  const friendship = await friendsRepo.blockFriendship(userId, targetUserId)

  void friendsRepo.persistEvent({
    type: EventType.USER_BLOCKED,
    userId,
    payload: { friendshipId: friendship.id, blockerId: userId, blockedId: targetUserId },
    source: 'friends.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist USER_BLOCKED event', { error: String(err) })
  })

  return { friendship: { id: friendship.id, status: friendship.status } }
}

export async function getFriends(userId: string): Promise<FriendsListResponse> {
  const rows = await friendsRepo.getAcceptedFriends(userId)
  const friends: FriendUser[] = rows.map((row) => {
    const friend = row.userAId === userId ? row.userB : row.userA
    return {
      id: friend.id,
      friendshipId: row.id,
      username: friend.username,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      streak: { current: friend.streak?.current ?? 0 },
    }
  })
  return { friends }
}

export async function searchUsers(
  query: string,
  requesterId: string
): Promise<UserSearchResponse> {
  const users = await friendsRepo.searchUsers(query, requesterId)
  return { users }
}

export async function getPendingFriendships(userId: string): Promise<PendingFriendsResponse> {
  const rows = await friendsRepo.getPendingFriendships(userId)
  const incoming: PendingFriendEntry[] = []
  const outgoing: PendingFriendEntry[] = []

  for (const row of rows) {
    if (row.userAId === userId) {
      // Viewer is the requester → this is outgoing; friend is userB
      outgoing.push({ friendshipId: row.id, user: row.userB })
    } else {
      // Viewer is the recipient → this is incoming; friend is userA
      incoming.push({ friendshipId: row.id, user: row.userA })
    }
  }

  return { incoming, outgoing }
}
