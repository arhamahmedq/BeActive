// Shared API response types for the public profile (Slice 8A).
// Imported by the profile page/hooks (frontend) and the users controller (backend).

// Relationship of the VIEWER to the profile owner. 'blocked' is never exposed —
// a blocked profile is hidden (404) — so the public union excludes it.
export type RelationshipState = 'self' | 'friends' | 'incoming' | 'outgoing' | 'none'

export interface PublicProfile {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  streak: { current: number; best: number }
  friendCount: number
  postCount: number // VERIFIED posts only
}

export interface PublicProfileResponse {
  profile: PublicProfile
  relationship: RelationshipState
  // Friendship row id for the viewer↔owner pair — needed to accept/decline/
  // cancel/remove from the profile. null for 'self' and 'none'.
  friendshipId: string | null
}

export interface ProfilePost {
  id: string
  imageUrl: string
  caption: string | null
  createdAt: string // ISO 8601
  workout: { type: string } | null
}

export interface ProfilePostsResponse {
  posts: ProfilePost[]
  nextCursor: string | null
}
