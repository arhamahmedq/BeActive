import { getAcceptedFriendIds } from '../friends/friends.service'
import { getEngagementSummaries } from '../interactions/interactions.service'
import { getFeedCandidates } from './feed.repo'
import { rankPosts } from './feed.ranking'
import { parseCursor, sliceByCursor } from './feed.cursor'
import type { FeedQueryInput } from './feed.schema'
import type { FeedResponse, FeedPostResponse } from '../../../shared/types/feed'
import { FEED_WINDOW_DAYS, FEED_CANDIDATE_CAP } from '../../../shared/constants/index'

export async function getFeed(
  userId: string,
  query: FeedQueryInput,
  _now?: Date,
): Promise<FeedResponse> {
  const now = _now ?? new Date()
  const cursor = parseCursor(query.cursor, now)
  const T0 = cursor?.t ?? now.getTime()
  const windowStart = new Date(T0 - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const friendIds = await getAcceptedFriendIds(userId)
  const authorIds = [...new Set([userId, ...friendIds])]

  const candidates = await getFeedCandidates(authorIds, windowStart, FEED_CANDIDATE_CAP)

  const rankable = candidates.map((r) => ({
    ...r,
    authorStreakCurrent: r.user.streak?.current ?? 0,
  }))

  const ranked = rankPosts(rankable, new Date(T0))
  const { page, nextCursor } = sliceByCursor(ranked, cursor, query.limit, T0)

  // Engagement enrichment (Slice 8B): bounded to the sliced PAGE only (≤ limit) —
  // never the candidate set — and never feeds back into ranking. The page IDs are
  // already self+accepted-friends (visibility pre-authorized by the pipeline).
  const summaries = await getEngagementSummaries(page.map((r) => r.id), userId)

  const posts: FeedPostResponse[] = page.map((r) => {
    const s = summaries.get(r.id)
    return {
      id: r.id,
      imageUrl: r.imageUrl,
      caption: r.caption,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: r.user.id,
        username: r.user.username,
        avatarUrl: r.user.avatarUrl,
        streak: { current: r.user.streak?.current ?? 0 },
      },
      workout: r.workout ? { type: r.workout.type } : null,
      likeCount: s?.likeCount ?? 0,
      commentCount: s?.commentCount ?? 0,
      likedByMe: s?.likedByMe ?? false,
    }
  })

  // emptyReason is a first-page-only discriminator (§4/§9). cursor === null is the
  // definitive "first page" signal — guarding on it prevents a forged/replayed
  // in-bounds cursor pointing past the end from emitting a misleading
  // NO_CONNECTIONS/NO_RECENT_ACTIVITY on a paginated request.
  if (cursor === null && posts.length === 0 && nextCursor === null) {
    const emptyReason = friendIds.length === 0 ? 'NO_CONNECTIONS' : 'NO_RECENT_ACTIVITY'
    return { posts, nextCursor, emptyReason }
  }

  return { posts, nextCursor }
}
