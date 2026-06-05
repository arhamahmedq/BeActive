// interactions service — likes + comments business logic.
// Authorization REUSES the posts visibility guard: getPost(viewerId, postId)
// throws NotFoundError (404) unless the viewer is the author or an accepted
// friend — so you can never like/comment a post you can't see. No posts refactor.
import * as repo from './interactions.repo'
import { getPost } from '../posts/posts.service'
import { isUniqueConstraintError } from '../../core/errors/prismaErrors'
import type {
  LikeMutationResponse,
  CommentsResponse,
  PostCommentDTO,
  PostEngagementSummary,
} from '../../../shared/types/interactions'

function encodeCursor(c: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ c: c.createdAt.toISOString(), i: c.id })).toString('base64url')
}

function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { c: string; i: string }
    const createdAt = new Date(o.c)
    if (Number.isNaN(createdAt.getTime()) || typeof o.i !== 'string') return null
    return { createdAt, id: o.i }
  } catch {
    return null
  }
}

export async function likePost(viewerId: string, postId: string): Promise<LikeMutationResponse> {
  await getPost(viewerId, postId) // visibility guard (404 if not viewable)
  try {
    await repo.createLike(postId, viewerId)
  } catch (err) {
    // Already liked (P2002 on @@unique) → idempotent success.
    if (!isUniqueConstraintError(err)) throw err
  }
  return { liked: true, likeCount: await repo.countLikes(postId) }
}

export async function unlikePost(viewerId: string, postId: string): Promise<LikeMutationResponse> {
  await getPost(viewerId, postId)
  await repo.deleteLike(postId, viewerId) // deleteMany → idempotent (0 or 1 row)
  return { liked: false, likeCount: await repo.countLikes(postId) }
}

export async function addComment(
  viewerId: string,
  postId: string,
  body: string,
): Promise<PostCommentDTO> {
  await getPost(viewerId, postId)
  const c = await repo.createComment(postId, viewerId, body)
  return { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), user: c.user }
}

export async function getComments(
  viewerId: string,
  postId: string,
  cursorRaw: string | undefined,
  limit: number,
): Promise<CommentsResponse> {
  await getPost(viewerId, postId)
  const cursor = decodeCursor(cursorRaw)
  const rows = await repo.listComments(postId, cursor, limit)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
  return {
    comments: page.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      user: c.user,
    })),
    nextCursor,
  }
}

// Feed enrichment — batch, viewer-scoped. NO per-post visibility check: the feed
// pipeline already restricts to self+accepted-friends, so the page IDs are
// pre-authorized. Called only by feed.service with the sliced page IDs (≤ limit).
export async function getEngagementSummaries(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, PostEngagementSummary>> {
  const rows = await repo.getEngagementSummaries(postIds, viewerId)
  const out = new Map<string, PostEngagementSummary>()
  for (const [id, s] of rows) {
    out.set(id, { likeCount: s.likeCount, commentCount: s.commentCount, likedByMe: s.likedByMe })
  }
  return out
}
