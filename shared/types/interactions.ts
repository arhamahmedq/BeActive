// Shared API types for post engagement (Slice 8B — interactions module).
// Imported by the interactions controller (backend) and the engagement
// hooks/components (frontend).

export interface PostEngagementSummary {
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

// Response of POST/DELETE /api/posts/[id]/like
export interface LikeMutationResponse {
  liked: boolean
  likeCount: number
}

export interface CommentAuthor {
  id: string
  username: string
  avatarUrl: string | null
}

export interface PostCommentDTO {
  id: string
  body: string
  createdAt: string // ISO 8601
  user: CommentAuthor
}

export interface CommentsResponse {
  comments: PostCommentDTO[]
  nextCursor: string | null
}
