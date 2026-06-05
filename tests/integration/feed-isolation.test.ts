/**
 * feed-isolation.test.ts — Data-isolation integration test (SLICE_5_FEED_DESIGN §12).
 *
 * Drives the REAL getFeed service + REAL ranking + REAL cursor pipeline; only the
 * persistence seams (feed.repo, friends.service) are replaced with in-memory fakes
 * that FAITHFULLY reproduce the production filter (authorIds ∈ set, status VERIFIED,
 * createdAt ≥ windowStart, take cap). No live DB — matches the streak-simulation pattern.
 *
 * Proves §11: a viewer can only ever see their own ∪ accepted-friends' VERIFIED posts,
 * the cursor cannot widen the author set, and only whitelisted fields cross the wire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/feed/feed.repo')
vi.mock('../../server/modules/friends/friends.service')
vi.mock('../../server/modules/interactions/interactions.service')

import { getFeed } from '../../server/modules/feed/feed.service'
import * as feedRepo from '../../server/modules/feed/feed.repo'
import * as friendsService from '../../server/modules/friends/friends.service'
import * as interactionsService from '../../server/modules/interactions/interactions.service'
import { encodeCursor } from '../../server/modules/feed/feed.cursor'

const NOW = new Date('2026-06-03T12:00:00Z')
const T0 = NOW.getTime()

type Status = 'VERIFIED' | 'PENDING' | 'REJECTED'

interface StoredPost {
  userId: string
  status: Status
  createdAt: Date
  row: Record<string, unknown>
}

const store: { posts: StoredPost[]; friendIds: string[] } = { posts: [], friendIds: [] }

function seed(opts: {
  id: string
  userId: string
  status?: Status
  hoursAgo?: number
  streak?: number
}) {
  const { id, userId, status = 'VERIFIED', hoursAgo = 1, streak = 0 } = opts
  const createdAt = new Date(T0 - hoursAgo * 3_600_000)
  store.posts.push({
    userId,
    status,
    createdAt,
    // The row carries EXTRA sensitive fields on purpose — the service's final
    // mapping must drop them (whitelist, not passthrough).
    row: {
      id,
      imageUrl: `https://cdn.example.com/${id}.jpg`,
      caption: null,
      createdAt,
      imageKey: `private/key/${id}`, // MUST NOT leak
      user: {
        id: userId,
        username: `user_${userId}`,
        avatarUrl: null,
        email: `${userId}@private.example.com`, // MUST NOT leak
        streak: { current: streak },
      },
      workout: { type: 'GYM', aiConfidence: 0.99 }, // aiConfidence MUST NOT leak
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  store.posts = []
  store.friendIds = []

  // Faithful reproduction of the production Prisma filter.
  vi.mocked(feedRepo.getFeedCandidates).mockImplementation(
    async (authorIds: string[], windowStart: Date, cap: number) => {
      if (authorIds.length === 0) return []
      return store.posts
        .filter(
          (p) =>
            p.status === 'VERIFIED' &&
            authorIds.includes(p.userId) &&
            p.createdAt.getTime() >= windowStart.getTime()
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, cap)
        .map((p) => p.row) as any
    }
  )

  vi.mocked(friendsService.getAcceptedFriendIds).mockImplementation(async () => store.friendIds)
  // Engagement enrichment is additive and bounded to the page; default to empty so
  // these isolation/whitelist assertions test the feed pipeline in isolation.
  vi.mocked(interactionsService.getEngagementSummaries).mockResolvedValue(new Map())
})

describe('feed isolation — author-set enforcement', () => {
  it('returns the viewer’s own ∪ accepted friends’ VERIFIED posts, never a non-friend’s', async () => {
    store.friendIds = ['friend-1']
    seed({ id: 'own-1', userId: 'viewer', hoursAgo: 1 })
    seed({ id: 'friend-post', userId: 'friend-1', hoursAgo: 2 })
    seed({ id: 'stranger-post', userId: 'stranger', hoursAgo: 1 }) // NOT a friend

    const result = await getFeed('viewer', { limit: 20 }, NOW)

    const ids = result.posts.map((p) => p.id)
    expect(ids).toContain('own-1')
    expect(ids).toContain('friend-post')
    expect(ids).not.toContain('stranger-post')
  })

  it('never returns PENDING or REJECTED posts, including the viewer’s own', async () => {
    seed({ id: 'own-verified', userId: 'viewer', status: 'VERIFIED', hoursAgo: 1 })
    seed({ id: 'own-pending', userId: 'viewer', status: 'PENDING', hoursAgo: 1 })
    seed({ id: 'own-rejected', userId: 'viewer', status: 'REJECTED', hoursAgo: 1 })

    const result = await getFeed('viewer', { limit: 20 }, NOW)

    const ids = result.posts.map((p) => p.id)
    expect(ids).toEqual(['own-verified'])
  })

  it('a forged cursor cannot widen the author set or surface a non-friend post', async () => {
    store.friendIds = []
    seed({ id: 'own-1', userId: 'viewer', hoursAgo: 1 })
    seed({ id: 'stranger-post', userId: 'stranger', hoursAgo: 1 })

    // Forge a cursor that references the stranger's post id with a huge score so
    // sliceByCursor's boundary filter admits everything.
    const forged = encodeCursor({ t: T0, s: 999, id: 'stranger-post' })

    const result = await getFeed('viewer', { cursor: forged, limit: 20 }, NOW)

    // The stranger's post never appears...
    expect(result.posts.map((p) => p.id)).not.toContain('stranger-post')
    // ...and the author set handed to the repo never included the stranger.
    const [authorIds] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    expect(authorIds).not.toContain('stranger')
    expect(authorIds).toEqual(['viewer'])
  })
})

describe('feed isolation — field whitelist', () => {
  it('emits only the documented fields; no imageKey / email / aiConfidence leak', async () => {
    seed({ id: 'own-1', userId: 'viewer', hoursAgo: 1, streak: 7 })

    const result = await getFeed('viewer', { limit: 20 }, NOW)
    const post = result.posts[0]

    expect(Object.keys(post).sort()).toEqual(
      ['caption', 'commentCount', 'createdAt', 'id', 'imageUrl', 'likeCount', 'likedByMe', 'user', 'workout'].sort()
    )
    expect((post as Record<string, unknown>).imageKey).toBeUndefined()

    expect(Object.keys(post.user).sort()).toEqual(
      ['avatarUrl', 'id', 'streak', 'username'].sort()
    )
    expect((post.user as Record<string, unknown>).email).toBeUndefined()

    expect(Object.keys(post.workout!).sort()).toEqual(['type'])
    expect((post.workout as Record<string, unknown>).aiConfidence).toBeUndefined()
  })
})
