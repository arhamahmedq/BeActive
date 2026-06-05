// interactions module — internal row shapes (repo ↔ service)

export interface CommentRow {
  id: string
  body: string
  createdAt: Date
  user: { id: string; username: string; avatarUrl: string | null }
}

export interface EngagementSummaryRow {
  postId: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
}
