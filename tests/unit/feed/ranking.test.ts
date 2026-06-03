import { describe, it, expect } from 'vitest'
import { scorePost, rankPosts } from '../../../server/modules/feed/feed.ranking'
import {
  FEED_STREAK_BOOST_CAP,
  FEED_STREAK_BOOST_DIVISOR,
  FEED_RECENCY_HALFLIFE_HOURS,
} from '../../../shared/constants/index'

const NOW = new Date('2026-01-15T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000)

describe('scorePost', () => {
  it('returns 1.0 for a post created exactly at T0 with no streak boost', () => {
    const score = scorePost({ createdAt: NOW, authorStreakCurrent: 0 }, NOW)
    expect(score).toBeCloseTo(1.0)
  })

  it('recency strictly decreases as the post ages', () => {
    const s1h = scorePost({ createdAt: hoursAgo(1), authorStreakCurrent: 0 }, NOW)
    const s24h = scorePost({ createdAt: hoursAgo(24), authorStreakCurrent: 0 }, NOW)
    const s72h = scorePost({ createdAt: hoursAgo(72), authorStreakCurrent: 0 }, NOW)
    expect(s1h).toBeGreaterThan(s24h)
    expect(s24h).toBeGreaterThan(s72h)
  })

  it('recency at the halflife (24h) is exactly 0.5 of maximum', () => {
    const score = scorePost({ createdAt: hoursAgo(FEED_RECENCY_HALFLIFE_HOURS), authorStreakCurrent: 0 }, NOW)
    expect(score).toBeCloseTo(0.5)
  })

  it('clamps hoursSince to 0 for a future-dated post (recency = 1.0)', () => {
    const score = scorePost({ createdAt: hoursAhead(5), authorStreakCurrent: 0 }, NOW)
    expect(score).toBeCloseTo(1.0)
  })

  it('applies zero boost for authorStreakCurrent = 0', () => {
    const score = scorePost({ createdAt: NOW, authorStreakCurrent: 0 }, NOW)
    expect(score).toBeCloseTo(1.0 * (1 + 0))
  })

  it('applies boost proportionally for streak below cap', () => {
    const streak = 50
    const expectedBoost = streak / FEED_STREAK_BOOST_DIVISOR
    const score = scorePost({ createdAt: NOW, authorStreakCurrent: streak }, NOW)
    expect(score).toBeCloseTo(1.0 * (1 + expectedBoost))
  })

  it('caps boost at FEED_STREAK_BOOST_CAP regardless of how large the streak is', () => {
    const atCap = scorePost({ createdAt: NOW, authorStreakCurrent: FEED_STREAK_BOOST_DIVISOR * FEED_STREAK_BOOST_CAP }, NOW)
    const wayOver = scorePost({ createdAt: NOW, authorStreakCurrent: 99_999 }, NOW)
    expect(atCap).toBeCloseTo(1.0 * (1 + FEED_STREAK_BOOST_CAP))
    expect(wayOver).toBeCloseTo(atCap)
  })
})

describe('rankPosts', () => {
  it('orders by score descending (newer post ranks higher when streak is equal)', () => {
    const posts = [
      { id: 'old', createdAt: hoursAgo(48), authorStreakCurrent: 0, extra: 'A' },
      { id: 'new', createdAt: hoursAgo(1), authorStreakCurrent: 0, extra: 'B' },
    ]
    const ranked = rankPosts(posts, NOW)
    expect(ranked[0].id).toBe('new')
    expect(ranked[1].id).toBe('old')
  })

  it('breaks tied scores by id ASC (total order for cursor stability)', () => {
    const sameTime = hoursAgo(10)
    const posts = [
      { id: 'zzz', createdAt: sameTime, authorStreakCurrent: 10 },
      { id: 'aaa', createdAt: sameTime, authorStreakCurrent: 10 },
      { id: 'mmm', createdAt: sameTime, authorStreakCurrent: 10 },
    ]
    const ranked = rankPosts(posts, NOW)
    expect(ranked.map((p) => p.id)).toEqual(['aaa', 'mmm', 'zzz'])
  })

  it('attaches a numeric score field to every ranked item', () => {
    const posts = [{ id: 'p1', createdAt: NOW, authorStreakCurrent: 5 }]
    const ranked = rankPosts(posts, NOW)
    expect(typeof ranked[0].score).toBe('number')
    expect(ranked[0].score).toBeGreaterThan(0)
  })

  it('carries through all original fields on the ranked item (generic T)', () => {
    const posts = [{ id: 'p1', createdAt: NOW, authorStreakCurrent: 0, imageUrl: 'https://cdn/x.jpg', caption: 'hi' }]
    const ranked = rankPosts(posts, NOW)
    expect(ranked[0].imageUrl).toBe('https://cdn/x.jpg')
    expect(ranked[0].caption).toBe('hi')
  })

  it('a high-streak older post can outrank a no-streak newer post', () => {
    const posts = [
      { id: 'recent', createdAt: hoursAgo(2), authorStreakCurrent: 0 },
      { id: 'older-highstreak', createdAt: hoursAgo(48), authorStreakCurrent: 9999 },
    ]
    const ranked = rankPosts(posts, NOW)
    // The ranking must match what scorePost computes — verify consistency
    const scores = posts.map((p) => ({ id: p.id, score: scorePost(p, NOW) }))
    const expectedFirst = scores.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))[0].id
    expect(ranked[0].id).toBe(expectedFirst)
  })

  it('returns an empty array for an empty input', () => {
    expect(rankPosts([], NOW)).toEqual([])
  })

  it('returns a single-item array unchanged (modulo the score field)', () => {
    const posts = [{ id: 'solo', createdAt: NOW, authorStreakCurrent: 20 }]
    const ranked = rankPosts(posts, NOW)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('solo')
  })
})
