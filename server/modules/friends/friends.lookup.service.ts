import * as friendsRepo from './friends.repo'

// Returns the friendship ID between two users, or null if none exists.
// Created to support the frontend remove action — GET /api/friends does not
// include friendshipId in its response, so the remove flow needs to resolve it.
export async function findFriendshipId(
  userId: string,
  otherUserId: string
): Promise<string | null> {
  const friendship = await friendsRepo.findFriendshipBetween(userId, otherUserId)
  return friendship?.id ?? null
}
