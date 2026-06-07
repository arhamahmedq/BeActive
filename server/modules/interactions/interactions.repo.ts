// interactions repository — Prisma queries only (PostLike / PostComment). No logic.
import { prisma } from '../../../app/web/lib/prisma'
import type { CommentRow, EngagementSummaryRow } from './interactions.types'

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: { id: true, username: true, avatarUrl: true } },
}

export async function createLike(postId: string, userId: string): Promise<void> {
  // May throw P2002 on the @@unique([postId,userId]) — caller treats as idempotent.
  await prisma.postLike.create({ data: { postId, userId } })
}

// deleteMany (not delete) → idempotent: 0 rows when not liked, no P2025.
export async function deleteLike(postId: string, userId: string): Promise<number> {
  const res = await prisma.postLike.deleteMany({ where: { postId, userId } })
  return res.count
}

export async function countLikes(postId: string): Promise<number> {
  return prisma.postLike.count({ where: { postId } })
}

export async function createComment(
  postId: string,
  userId: string,
  body: string,
): Promise<CommentRow> {
  return prisma.postComment.create({
    data: { postId, userId, body },
    select: commentSelect,
  })
}

// Keyset pagination on (createdAt DESC, id DESC). Returns up to limit+1 rows.
export async function listComments(
  postId: string,
  cursor: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<CommentRow[]> {
  return prisma.postComment.findMany({
    where: {
      postId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: commentSelect,
  })
}

export async function findCommentById(
  commentId: string,
): Promise<{ id: string; postId: string; userId: string } | null> {
  return prisma.postComment.findUnique({
    where: { id: commentId },
    select: { id: true, postId: true, userId: true },
  })
}

// deleteMany → idempotent: 0 rows when already gone, no P2025.
export async function deleteCommentById(commentId: string): Promise<void> {
  await prisma.postComment.deleteMany({ where: { id: commentId } })
}

// Batch engagement summary for a bounded set of post IDs (the feed PAGE, ≤ limit).
// Three indexed queries — never a per-post N+1, never over the candidate set.
export async function getEngagementSummaries(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, EngagementSummaryRow>> {
  const out = new Map<string, EngagementSummaryRow>()
  if (postIds.length === 0) return out

  const [likeGroups, commentGroups, myLikes] = await Promise.all([
    prisma.postLike.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }),
    prisma.postComment.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { _all: true } }),
    prisma.postLike.findMany({ where: { postId: { in: postIds }, userId: viewerId }, select: { postId: true } }),
  ])

  const likeMap = new Map(likeGroups.map((g) => [g.postId, g._count._all]))
  const commentMap = new Map(commentGroups.map((g) => [g.postId, g._count._all]))
  const likedByMe = new Set(myLikes.map((l) => l.postId))

  for (const id of postIds) {
    out.set(id, {
      postId: id,
      likeCount: likeMap.get(id) ?? 0,
      commentCount: commentMap.get(id) ?? 0,
      likedByMe: likedByMe.has(id),
    })
  }
  return out
}
