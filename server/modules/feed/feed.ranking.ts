import {
  FEED_RECENCY_HALFLIFE_HOURS,
  FEED_STREAK_BOOST_DIVISOR,
  FEED_STREAK_BOOST_CAP,
} from '../../../shared/constants/index'

export function scorePost(
  p: { createdAt: Date; authorStreakCurrent: number },
  now: Date
): number {
  const hoursSince = Math.max(0, (now.getTime() - p.createdAt.getTime()) / 3_600_000)
  const recency = 1 / (1 + hoursSince / FEED_RECENCY_HALFLIFE_HOURS)
  const boost = Math.min((p.authorStreakCurrent ?? 0) / FEED_STREAK_BOOST_DIVISOR, FEED_STREAK_BOOST_CAP)
  return recency * (1 + boost)
}

export function rankPosts<T extends { id: string; createdAt: Date; authorStreakCurrent: number }>(
  posts: T[],
  now: Date
): Array<T & { score: number }> {
  return posts
    .map((p) => ({ ...p, score: scorePost(p, now) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}
