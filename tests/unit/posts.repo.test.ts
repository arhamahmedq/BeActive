import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  post: {
    findMany: vi.fn(),
  },
}))

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import { hasActivePostForLocalDate } from '../../server/modules/posts/posts.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('hasActivePostForLocalDate — local calendar day, not UTC', () => {
  it('queries only PENDING/VERIFIED posts within the trailing 36h window', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])
    const now = new Date('2024-01-15T12:00:00Z')

    await hasActivePostForLocalDate('user-1', 'UTC', now)

    const arg = mockPrisma.post.findMany.mock.calls[0][0]
    expect(arg.where.userId).toBe('user-1')
    expect(arg.where.status).toEqual({ in: [PostStatus.PENDING, PostStatus.VERIFIED] })
    // 36h before now
    expect(arg.where.createdAt.gte).toEqual(new Date('2024-01-14T00:00:00Z'))
  })

  it('returns false when there are no recent posts', async () => {
    mockPrisma.post.findMany.mockResolvedValue([])
    const result = await hasActivePostForLocalDate('user-1', 'UTC', new Date('2024-01-15T12:00:00Z'))
    expect(result).toBe(false)
  })

  it('returns true when a post falls on the same local day (UTC)', async () => {
    mockPrisma.post.findMany.mockResolvedValue([{ createdAt: new Date('2024-01-15T08:00:00Z') }])
    const result = await hasActivePostForLocalDate('user-1', 'UTC', new Date('2024-01-15T20:00:00Z'))
    expect(result).toBe(true)
  })

  // Honolulu = UTC-10. A post at 23:00Z Jan 15 is 13:00 *local* Jan 15.
  // "now" at 01:00Z Jan 16 is 15:00 *local* Jan 15 — STILL the same local day.
  // The old UTC-midnight guard saw "different UTC day" and wrongly allowed a
  // duplicate same-local-day post. The local-day guard correctly blocks it.
  it('blocks a duplicate within the same local day across the UTC boundary (UTC-10)', async () => {
    mockPrisma.post.findMany.mockResolvedValue([{ createdAt: new Date('2024-01-15T23:00:00Z') }])
    const result = await hasActivePostForLocalDate(
      'user-1',
      'Pacific/Honolulu',
      new Date('2024-01-16T01:00:00Z')
    )
    expect(result).toBe(true)
  })

  // Auckland = UTC+13 (NZDT in January). A post at 09:00Z Jan 15 is 22:00 local Jan 15.
  // "now" at 13:00Z Jan 15 is 02:00 local Jan 16 — a genuinely NEW local day.
  // The old UTC-midnight guard saw "same UTC day" and wrongly BLOCKED the user
  // from logging their new day (silently breaking the streak). The local-day
  // guard correctly allows it.
  it('allows a post on a new local day even within the same UTC day (UTC+13)', async () => {
    mockPrisma.post.findMany.mockResolvedValue([{ createdAt: new Date('2024-01-15T09:00:00Z') }])
    const result = await hasActivePostForLocalDate(
      'user-1',
      'Pacific/Auckland',
      new Date('2024-01-15T13:00:00Z')
    )
    expect(result).toBe(false)
  })
})
