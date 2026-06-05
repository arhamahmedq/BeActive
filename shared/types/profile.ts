// Shared API response types for the public profile (Slice 8A).
// Imported by the profile page/hooks (frontend) and the users controller (backend).
import type { FeedPostResponse } from './feed'

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

// Profile posts use the SAME shape as the feed (FeedPostResponse) so the profile
// can render the same FeedCard — including the like/comment/share engagement bar.
// Single source of truth for a post-as-rendered.
export interface ProfilePostsResponse {
  posts: FeedPostResponse[]
  nextCursor: string | null
}
