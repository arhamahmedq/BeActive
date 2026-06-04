// Shared API response types for the Friends module.
// Imported by frontend hooks (useFriends, usePendingFriends, useUserSearch)
// and used as return types in friends.controller.ts.
// Pattern mirrors shared/types/feed.ts.

export interface FriendUser {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  streak: { current: number } // 0 when no Streak row exists (newly signed up user)
}

export interface FriendsListResponse {
  friends: FriendUser[]
}

export interface PendingFriendEntry {
  friendshipId: string
  user: {
    id: string
    username: string
    avatarUrl: string | null
  }
}

export interface PendingFriendsResponse {
  incoming: PendingFriendEntry[]
  outgoing: PendingFriendEntry[]
}

export interface UserSearchResult {
  id: string
  username: string
  avatarUrl: string | null
}

export interface UserSearchResponse {
  users: UserSearchResult[]
}

// Returned by POST /friends/request (201) and POST /friends/accept (200).
export interface FriendshipMutationResponse {
  friendship: {
    id: string
    status: string
  }
}
