/**
 * feed-pagination.test.ts — Pagination integrity integration test (SLICE_5_FEED_DESIGN §12).
 *
 * Stitches real pages over a fixed snapshot by feeding each response's nextCursor
 * back into the next getFeed call — exercising the REAL service + ranking + cursor
 * against a faithful in-memory repo. Proves: page1 ⊕ page2 ⊕ … = the full ranked set,
 * no duplicates, no gaps, terminates with nextCursor=null, and the FEED_CANDIDATE_CAP
 * bounded-truncation behaviour (oldest-beyond-cap unreachable, no error).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FEED_CANDIDATE_CAP } from '../../shared/constants/index'

vi.mock('../../server/modules/feed/feed.repo')
vi.mock('../../server/modules/friends/friends.service')
vi.mock('../../server/modules/interactions/interactions.service')

import { getFeed } from '../../server/modules/feed/feed.service'
import * as feedRepo from '../../server/modules/feed/feed.repo'
import * as friendsService from '../../server/modules/friends/friends.service'
import * as interactionsService from '../../server/modules/interactions/interactions.service'

const NOW = new Date('2026-06-03T12:00:00Z')
const T0 = NOW.getTime()

interface StoredPost {
  userId: string
  createdAt: Date
  row: Record<string, unknown>
}

const store: { posts: StoredPost[] } = { posts: [] }

/** Seed `n` VERIFIED viewer posts, each 1 minute older than the last (all in-window). */
function seedViewerPosts(n: number) {
  for (let i = 0; i < n; i++) {
    const id = `p${String(i).padStart(4, '0')}`
    const createdAt = new Date(T0 - (i + 1) * 60_000) // strictly decreasing → no score ties
    store.posts.push({
      userId: 'viewer',
      createdAt,
      row: {
        id,
        imageUrl: `https://cdn.example.com/${id}.jpg`,
        caption: null,
        createdAt,
        user: { id: 'viewer', username: 'viewer', avatarUrl: null, streak: { current: 0 } },
        workout: { type: 'GYM' },
      },
    })
  }
}

/** Drive getFeed page-by-page, feeding nextCursor back in; return the ordered id list. */
async function paginateAll(limit: number): Promise<string[]> {
  let cursor: string | undefined = undefined
  const seen: string[] = []
  let guard = 0
  for (;;) {
    const res = await getFeed('viewer', cursor === undefined ? { limit } : { cursor, limit }, NOW)
    seen.push(...res.posts.map((p) => p.id))
    if (res.nextCursor === null) break
    cursor = res.nextCursor
    if (++guard > 10_000) throw new Error('pagination did not terminate')
  }
  return seen
}

beforeEach(() => {
  vi.clearAllMocks()
  store.posts = []

  vi.mocked(feedRepo.getFeedCandidates).mockImplementation(
    async (authorIds: string[], windowStart: Date, cap: number) => {
      if (authorIds.length === 0) return []
      return store.posts
        .filter(
          (p) => authorIds.includes(p.userId) && p.createdAt.getTime() >= windowStart.getTime()
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, cap)
        .map((p) => p.row) as any
    }
  )

  vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
  vi.mocked(interactionsService.getEngagementSummaries).mockResolvedValue(new Map())
})

describe('feed pagination — stitched snapshot', () => {
  it('stitches all pages with no duplicates and no gaps, terminating at nextCursor=null', async () => {
    const TOTAL = 23
    seedViewerPosts(TOTAL)

    const seen = await paginateAll(5)

    // newest-first order (equal streak → recency-only), which is creation order p0000..
    const expected = Array.from({ length: TOTAL }, (_, i) => `p${String(i).padStart(4, '0')}`)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(TOTAL) // no duplicates
    expect(seen).toHaveLength(TOTAL) // no gaps
  })

  it('returns a single full page with nextCursor=null when everything fits', async () => {
    seedViewerPosts(4)
    const res = await getFeed('viewer', { limit: 20 }, NOW)
    expect(res.posts).toHaveLength(4)
    expect(res.nextCursor).toBeNull()
  })

  it('bounded truncation: with candidates beyond FEED_CANDIDATE_CAP, exactly cap are reachable then terminates', async () => {
    const OVER = FEED_CANDIDATE_CAP + 5
    seedViewerPosts(OVER)

    const seen = await paginateAll(50)

    // Exactly cap distinct posts traversed (the newest cap), no error, clean termination.
    expect(seen).toHaveLength(FEED_CANDIDATE_CAP)
    expect(new Set(seen).size).toBe(FEED_CANDIDATE_CAP)
    const expected = Array.from({ length: FEED_CANDIDATE_CAP }, (_, i) => `p${String(i).padStart(4, '0')}`)
    expect(seen).toEqual(expected)
    // the 5 oldest-beyond-cap are unreachable in this snapshot
    expect(seen).not.toContain(`p${String(OVER - 1).padStart(4, '0')}`)
  })
})
