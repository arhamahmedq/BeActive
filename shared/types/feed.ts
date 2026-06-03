export interface FeedPostResponse {
  id: string
  imageUrl: string
  caption: string | null
  createdAt: string                  // ISO 8601 — Date serialized by NextResponse.json
  user: {
    id: string
    username: string
    avatarUrl: string | null
    streak: { current: number }      // 0 when the author has no Streak row
  }
  workout: { type: string } | null
}

export type FeedEmptyReason = 'NO_CONNECTIONS' | 'NO_RECENT_ACTIVITY'

export interface FeedResponse {
  posts: FeedPostResponse[]
  nextCursor: string | null
  emptyReason?: FeedEmptyReason      // present ONLY on an empty first page; absent otherwise
}

export interface FeedQuery {
  cursor?: string
  limit: number
}
