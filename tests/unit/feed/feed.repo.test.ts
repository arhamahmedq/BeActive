import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostStatus } from '@prisma/client'

// Mock the Prisma client so we can assert the exact query shape the repo issues.
// This is the real authorization/status/window/cap filter that every isolation
// claim in SLICE_5_FEED_DESIGN §11 ultimately rests on.
const mockPrisma = vi.hoisted(() => ({
  post: {
    findMany: vi.fn(),
  },
}))

vi.mock('../../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import { getFeedCandidates } from '../../../server/modules/feed/feed.repo'

const WINDOW_START = new Date('2026-05-04T12:00:00Z')
const CAP = 500

beforeEach(() => {
  vi.clearAllMocks()
})

describe('feed.repo.getFeedCandidates — query shape', () => {
  it('returns [] WITHOUT querying when authorIds is empty', async () => {
    const result = await getFeedCandidates([], WINDOW_START, CAP)

    expect(result).toEqual([])
    expect(mockPrisma.post.findMany).not.toHaveBeenCalled()
  })

  it('filters to VERIFIED posts by the given authors within the window', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])

    await getFeedCandidates(['viewer', 'friend-1'], WINDOW_START, CAP)

    expect(mockPrisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ['viewer', 'friend-1'] },
          status: PostStatus.VERIFIED,
          createdAt: { gte: WINDOW_START },
        },
      })
    )
  })

  it('orders by createdAt descending and caps retrieval at `cap`', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])

    await getFeedCandidates(['viewer'], WINDOW_START, CAP)

    const arg = mockPrisma.post.findMany.mock.calls[0][0]
    expect(arg.orderBy).toEqual({ createdAt: 'desc' })
    expect(arg.take).toBe(CAP)
  })

  it('selects only whitelisted fields (no email / imageKey / aiConfidence)', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])

    await getFeedCandidates(['viewer'], WINDOW_START, CAP)

    const select = mockPrisma.post.findMany.mock.calls[0][0].select
    expect(select).toEqual({
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
    })
    // explicit negative assertions on the leak-prone fields
    expect(select.imageKey).toBeUndefined()
    expect(select.user.select.email).toBeUndefined()
    expect(select.user.select.timezone).toBeUndefined()
    expect(select.workout.select.aiConfidence).toBeUndefined()
  })

  it('passes the prisma result straight through', async () => {
    const rows = [{ id: 'p1' }, { id: 'p2' }]
    mockPrisma.post.findMany.mockResolvedValue(rows)

    const result = await getFeedCandidates(['viewer'], WINDOW_START, CAP)

    expect(result).toBe(rows)
  })
})
