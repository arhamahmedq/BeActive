import { FriendshipStatus } from '@prisma/client'

// Internal repo return types — not exposed through the API.
// API response types live in shared/types/friends.ts.

export interface FriendshipRecord {
  id: string
  userAId: string  // always the requester (convention enforced in sendFriendRequest)
  userBId: string  // always the recipient
  status: FriendshipStatus
  createdAt: Date
}

export interface FriendRowData {
  id: string
  userAId: string
  userBId: string
  userA: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    streak: { current: number } | null
  }
  userB: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    streak: { current: number } | null
  }
}

export interface PendingRowData {
  id: string
  userAId: string
  userBId: string
  userA: { id: string; username: string; avatarUrl: string | null }
  userB: { id: string; username: string; avatarUrl: string | null }
}
