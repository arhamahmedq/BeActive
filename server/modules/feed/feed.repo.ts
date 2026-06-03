import { PostStatus } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { FeedCandidateRow } from './feed.types'

// windowStart and cap are CALLER-SUPPLIED (derived from frozen T0 and
// FEED_CANDIDATE_CAP respectively). This repo adds no logic beyond the query.
export async function getFeedCandidates(
  authorIds: string[],
  windowStart: Date,
  cap: number,
): Promise<FeedCandidateRow[]> {
  if (authorIds.length === 0) return []
  return prisma.post.findMany({
    where: {
      userId: { in: authorIds },
      status: PostStatus.VERIFIED,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
    take: cap,
    select: {
      id: true,
      imageUrl: true,
      caption: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          streak: { select: { current: true } },
        },
      },
      workout: { select: { type: true } },
    },
  })
}
