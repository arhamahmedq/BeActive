import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../server/modules/friends/friends.service')
vi.mock('../../../server/modules/feed/feed.repo')

import { getFeed } from '../../../server/modules/feed/feed.service'
import * as friendsService from '../../../server/modules/friends/friends.service'
import * as feedRepo from '../../../server/modules/feed/feed.repo'
import { encodeCursor } from '../../../server/modules/feed/feed.cursor'
import { ValidationError } from '../../../server/core/errors/AppError'
import { FEED_WINDOW_DAYS, FEED_CANDIDATE_CAP } from '../../../shared/constants/index'

const NOW = new Date('2026-06-03T12:00:00Z')
const T0 = NOW.getTime()

function makeCandidate(
  id: string,
  hoursAgo: number,
  streakCurrent: number | null = 0,
  workoutType: 'GYM' | 'RUNNING' | 'CYCLING' | null = 'GYM',
) {
  return {
    id,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    caption: null as string | null,
    createdAt: new Date(T0 - hoursAgo * 3_600_000),
    user: {
      id: `user-${id}`,
      username: `user_${id}`,
      avatarUrl: null as string | null,
      streak: streakCurrent !== null ? { current: streakCurrent } : null,
    },
    workout: workoutType !== null ? { type: workoutType as 'GYM' } : null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// authorIds composition
// ---------------------------------------------------------------------------
describe('getFeed — authorIds', () => {
  it('always includes the viewer even with no friends', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { limit: 20 }, NOW)

    const [authorIds] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    expect(authorIds).toContain('viewer-1')
  })

  it('includes the viewer plus all accepted friend ids', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-a', 'friend-b'])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { limit: 20 }, NOW)

    const [authorIds] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    expect(authorIds).toContain('viewer-1')
    expect(authorIds).toContain('friend-a')
    expect(authorIds).toContain('friend-b')
    expect(authorIds).toHaveLength(3)
  })

  it('deduplicates if viewer id appears in friendIds', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['viewer-1', 'friend-a'])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { limit: 20 }, NOW)

    const [authorIds] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    const viewerCount = authorIds.filter((id: string) => id === 'viewer-1').length
    expect(viewerCount).toBe(1)
    expect(authorIds).toHaveLength(2)
  })

  it('passes FEED_CANDIDATE_CAP as the cap argument', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { limit: 20 }, NOW)

    const [, , cap] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    expect(cap).toBe(FEED_CANDIDATE_CAP)
  })
})

// ---------------------------------------------------------------------------
// windowStart — must come from frozen T0, not a live clock
// ---------------------------------------------------------------------------
describe('getFeed — windowStart is derived from frozen T0', () => {
  it('on the first page, derives windowStart from _now (no cursor)', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { limit: 20 }, NOW)

    const [, windowStart] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    const expected = new Date(T0 - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    expect(windowStart.getTime()).toBe(expected.getTime())
  })

  it('on a subsequent page, derives windowStart from cursor.t (not live _now)', async () => {
    const olderT0 = T0 - 6 * 3_600_000 // cursor was minted 6h ago
    const cursor = encodeCursor({ t: olderT0, s: 0.5, id: 'some-post' })

    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await getFeed('viewer-1', { cursor, limit: 20 }, NOW)

    const [, windowStart] = vi.mocked(feedRepo.getFeedCandidates).mock.calls[0]
    const expected = new Date(olderT0 - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    expect(windowStart.getTime()).toBe(expected.getTime())
  })
})

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------
describe('getFeed — response mapping', () => {
  it('maps a candidate row to a FeedPostResponse with all fields', async () => {
    const candidate = makeCandidate('post-1', 2, 12, 'GYM')
    candidate.caption = 'leg day'
    candidate.user.avatarUrl = 'https://cdn.example.com/avatar.jpg'

    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([candidate] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts).toHaveLength(1)
    const post = result.posts[0]
    expect(post.id).toBe('post-1')
    expect(post.imageUrl).toBe(candidate.imageUrl)
    expect(post.caption).toBe('leg day')
    expect(post.createdAt).toBe(candidate.createdAt.toISOString())
    expect(post.user.id).toBe(candidate.user.id)
    expect(post.user.username).toBe(candidate.user.username)
    expect(post.user.avatarUrl).toBe('https://cdn.example.com/avatar.jpg')
    expect(post.user.streak.current).toBe(12)
    expect(post.workout).toEqual({ type: 'GYM' })
  })

  it('maps streak: null to streak.current = 0', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([makeCandidate('p1', 2, null)] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts[0].user.streak.current).toBe(0)
  })

  it('maps workout: null to null on the response', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([makeCandidate('p1', 2, 5, null)] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts[0].workout).toBeNull()
  })

  it('serializes createdAt as an ISO string', async () => {
    const candidate = makeCandidate('p1', 2, 0, 'RUNNING')
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([candidate] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(typeof result.posts[0].createdAt).toBe('string')
    expect(result.posts[0].createdAt).toBe(candidate.createdAt.toISOString())
  })
})

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('getFeed — pagination', () => {
  it('returns nextCursor when more items remain beyond the page', async () => {
    const candidates = [
      makeCandidate('p1', 1, 0),
      makeCandidate('p2', 2, 0),
      makeCandidate('p3', 3, 0),
    ]
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue(candidates as any)

    const result = await getFeed('viewer-1', { limit: 2 }, NOW)

    expect(result.posts).toHaveLength(2)
    expect(result.nextCursor).not.toBeNull()
  })

  it('returns nextCursor: null when all items fit on one page', async () => {
    const candidates = [makeCandidate('p1', 1, 0), makeCandidate('p2', 2, 0)]
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue(candidates as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.nextCursor).toBeNull()
  })

  it('ranks posts in descending score order (fresher post ranked first)', async () => {
    const candidates = [
      makeCandidate('p-old', 10, 0),
      makeCandidate('p-new', 1, 0),
    ]
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue(candidates as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts[0].id).toBe('p-new')
    expect(result.posts[1].id).toBe('p-old')
  })

  it('omits emptyReason on any non-empty response', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([makeCandidate('p1', 2, 0)] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.emptyReason).toBeUndefined()
  })

  it('omits emptyReason when there are posts and a nextCursor', async () => {
    const candidates = Array.from({ length: 3 }, (_, i) => makeCandidate(`p${i + 1}`, i + 1, 0))
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue(candidates as any)

    const result = await getFeed('viewer-1', { limit: 1 }, NOW)

    expect(result.posts).toHaveLength(1)
    expect(result.nextCursor).not.toBeNull()
    expect(result.emptyReason).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// emptyReason discrimination (Case A vs Case B)
// ---------------------------------------------------------------------------
describe('getFeed — emptyReason', () => {
  it('sets NO_CONNECTIONS when friendIds is empty and there are no posts', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
    expect(result.emptyReason).toBe('NO_CONNECTIONS')
  })

  it('sets NO_RECENT_ACTIVITY when friends exist but no posts are in the window', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-1'])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.posts).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
    expect(result.emptyReason).toBe('NO_RECENT_ACTIVITY')
  })

  it('sets NO_RECENT_ACTIVITY when multiple friends exist but no posts', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-1', 'friend-2', 'friend-3'])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect(result.emptyReason).toBe('NO_RECENT_ACTIVITY')
  })

  it('omits emptyReason entirely (not just undefined) on non-empty responses', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-1'])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([makeCandidate('p1', 2, 0)] as any)

    const result = await getFeed('viewer-1', { limit: 20 }, NOW)

    expect('emptyReason' in result).toBe(false)
  })

  it('does NOT set emptyReason on an empty PAGINATED (cursored) response — first-page only', async () => {
    // A forged/replayed in-bounds cursor that lands past the end yields an empty
    // page. emptyReason is a first-page discriminator (§4/§9) and must be absent
    // here — otherwise a deep cursor would emit a misleading NO_CONNECTIONS.
    const cursor = encodeCursor({ t: T0, s: 0.5, id: 'whatever' })
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    const result = await getFeed('viewer-1', { cursor, limit: 20 }, NOW)

    expect(result.posts).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
    expect('emptyReason' in result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Cursor validation propagation
// ---------------------------------------------------------------------------
describe('getFeed — cursor error handling', () => {
  it('propagates ValidationError for a malformed cursor', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await expect(getFeed('viewer-1', { cursor: '!!!not-valid!!!', limit: 20 }, NOW))
      .rejects.toThrow(ValidationError)
  })

  it('accepts an undefined cursor as a valid first-page request', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await expect(getFeed('viewer-1', { limit: 20 }, NOW)).resolves.toBeDefined()
  })

  it('accepts an empty string cursor as a valid first-page request', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
    vi.mocked(feedRepo.getFeedCandidates).mockResolvedValue([])

    await expect(getFeed('viewer-1', { cursor: '', limit: 20 }, NOW)).resolves.toBeDefined()
  })
})
