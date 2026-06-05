import { FriendshipStatus, NotificationType } from '@prisma/client'
import * as friendsRepo from './friends.repo'
import { getProfile } from '../users/users.service'
import { createNotification } from '../notifications/notifications.service'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError'
import { isUniqueConstraintError, isRecordNotFoundError } from '../../core/errors/prismaErrors'
import type { FriendshipRecord } from './friends.types'
import type {
  FriendsListResponse,
  PendingFriendsResponse,
  FriendshipMutationResponse,
  FriendUser,
  PendingFriendEntry,
  UserSearchResponse,
} from '../../../shared/types/friends'
import type { RelationshipState } from '../../../shared/types/profile'

// ---------------------------------------------------------------------------
// Existing — used by the feed pipeline (Slice 5)
// ---------------------------------------------------------------------------

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  return friendsRepo.getAcceptedFriendIds(userId)
}

// Single-pair friendship check (visibility primitive, reused by post/profile
// authorization). True ONLY for an ACCEPTED friendship in either direction —
// false for self, none, pending, or blocked.
export async function areFriends(userId: string, otherUserId: string): Promise<boolean> {
  const friendship = await friendsRepo.findFriendshipBetween(userId, otherUserId)
  return friendship?.status === FriendshipStatus.ACCEPTED
}

// Viewer→target relationship for the profile header. Superset of the public
// RelationshipState (adds 'blocked', which callers translate into a hidden 404).
export type FriendRelationship = RelationshipState | 'blocked'

export interface RelationshipInfo {
  state: FriendRelationship
  // The friendship row id — needed to accept/decline/cancel/remove from the
  // profile. null for 'self' and 'none' (no row to act on).
  friendshipId: string | null
}

export async function getRelationship(
  viewerId: string,
  targetId: string,
): Promise<RelationshipInfo> {
  if (viewerId === targetId) return { state: 'self', friendshipId: null }
  const f = await friendsRepo.findFriendshipBetween(viewerId, targetId)
  if (!f) return { state: 'none', friendshipId: null }
  switch (f.status) {
    case FriendshipStatus.ACCEPTED:
      return { state: 'friends', friendshipId: f.id }
    case FriendshipStatus.BLOCKED:
      return { state: 'blocked', friendshipId: f.id }
    case FriendshipStatus.PENDING:
      // userAId is always the requester (Slice 6 convention).
      return { state: f.userAId === viewerId ? 'outgoing' : 'incoming', friendshipId: f.id }
    default:
      return { state: 'none', friendshipId: null }
  }
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

  let updated: FriendshipRecord
  try {
    updated = await friendsRepo.updateFriendshipStatus(friendshipId, FriendshipStatus.ACCEPTED)
  } catch (err) {
    // Row deleted between the read and the update (e.g. requester cancelled, or a
    // block landed concurrently) → Prisma P2025. Surface as a state conflict, not 500.
    if (isRecordNotFoundError(err)) throw new ConflictError('This friend request is no longer pending')
    throw err
  }

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

  try {
    await friendsRepo.deleteFriendship(friendshipId)
  } catch (err) {
    if (isRecordNotFoundError(err)) throw new ConflictError('This friend request is no longer pending')
    throw err
  }
  // Rejection is silent — no event emitted
}

export async function removeFriend(userId: string, friendshipId: string): Promise<void> {
  const friendship = await friendsRepo.findFriendshipById(friendshipId)
  if (!friendship) throw new NotFoundError('Friendship')

  // /remove operates on friendships and pending requests only. A BLOCKED row is
  // not a friendship — removing it would silently unblock. Treat it as absent so
  // /remove can never lift a block; unblocking goes through unblockUser (blocker-only).
  if (friendship.status === FriendshipStatus.BLOCKED) throw new NotFoundError('Friendship')

  const isParticipant = friendship.userAId === userId || friendship.userBId === userId
  if (!isParticipant) throw new ForbiddenError()

  // For PENDING rows: only the requester (userAId) may cancel — recipient must use reject
  if (friendship.status === FriendshipStatus.PENDING && friendship.userAId !== userId) {
    throw new ForbiddenError()
  }

  try {
    await friendsRepo.deleteFriendship(friendshipId)
  } catch (err) {
    // Concurrent delete (the row vanished between the read above and here) → 404, not 500.
    if (isRecordNotFoundError(err)) throw new NotFoundError('Friendship')
    throw err
  }

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

// Cancel an OUTGOING friend request. Distinct from removeFriend so it can never
// delete an ACCEPTED friendship: if the recipient accepted between the UI render
// and the click, this 409s instead of silently unfriending them (F5).
export async function cancelFriendRequest(userId: string, friendshipId: string): Promise<void> {
  const friendship = await friendsRepo.findFriendshipById(friendshipId)
  if (!friendship) throw new NotFoundError('Friend request')

  // Only the requester (userAId) can cancel their own outgoing request.
  if (friendship.userAId !== userId) throw new ForbiddenError()

  if (friendship.status !== FriendshipStatus.PENDING) {
    throw new ConflictError('This request can no longer be cancelled')
  }

  try {
    await friendsRepo.deleteFriendship(friendshipId)
  } catch (err) {
    if (isRecordNotFoundError(err)) throw new ConflictError('This request can no longer be cancelled')
    throw err
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

  // Replaces the blocker's own relationship with the target with a BLOCKED row
  // (userA = blocker). Once present, searchUsers excludes the pair (both directions)
  // and the pull-model feed/friends list never surface blocked users (ACCEPTED-only).
  let friendship: FriendshipRecord
  try {
    friendship = await friendsRepo.blockFriendship(userId, targetUserId)
  } catch (err) {
    // Concurrent identical block (double-click / retry): the second create races the
    // @@unique([userAId, userBId]) index. Resolve idempotently — return the existing
    // BLOCKED row rather than leaking a 500.
    if (isUniqueConstraintError(err)) {
      const existing = await friendsRepo.findDirectedFriendship(userId, targetUserId)
      if (existing && existing.status === FriendshipStatus.BLOCKED) {
        return { friendship: { id: existing.id, status: existing.status } }
      }
      throw new ConflictError('Block could not be completed; please retry')
    }
    throw err
  }

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

// Lift a block the caller previously created. Blocker-only: deletes the
// (blocker → target, BLOCKED) row and nothing else, so it can never touch the
// target's own block of the caller (see directional delete in blockFriendship).
export async function unblockUser(userId: string, targetUserId: string): Promise<void> {
  if (userId === targetUserId) {
    throw new ConflictError('You cannot unblock yourself')
  }

  // Directional: only the caller's own (caller → target) row, and only if BLOCKED.
  const existing = await friendsRepo.findDirectedFriendship(userId, targetUserId)
  if (!existing || existing.status !== FriendshipStatus.BLOCKED) {
    throw new NotFoundError('Block')
  }

  try {
    await friendsRepo.deleteFriendship(existing.id)
  } catch (err) {
    if (isRecordNotFoundError(err)) throw new NotFoundError('Block')
    throw err
  }

  void friendsRepo.persistEvent({
    type: EventType.USER_UNBLOCKED,
    userId,
    payload: { friendshipId: existing.id, blockerId: userId, unblockedId: targetUserId },
    source: 'friends.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist USER_UNBLOCKED event', { error: String(err) })
  })
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
