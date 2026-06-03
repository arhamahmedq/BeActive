import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendshipStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  friendship: {
    findMany: vi.fn(),
  },
}))

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import { getAcceptedFriendIds } from '../../server/modules/friends/friends.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('friends.repo.getAcceptedFriendIds — arm mapping and filtering', () => {
  it('returns the other user id when viewer is on arm A (userAId)', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'viewer', userBId: 'friend-B' }])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual(['friend-B'])
  })

  it('returns the other user id when viewer is on arm B (userBId)', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'friend-A', userBId: 'viewer' }])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual(['friend-A'])
  })

  it('handles a mix of arm A and arm B rows from a single query', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([
      { userAId: 'viewer', userBId: 'friend-1' },
      { userAId: 'friend-2', userBId: 'viewer' },
      { userAId: 'viewer', userBId: 'friend-3' },
    ])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toHaveLength(3)
    expect(result).toContain('friend-1')
    expect(result).toContain('friend-2')
    expect(result).toContain('friend-3')
  })

  it('queries only ACCEPTED rows via the WHERE clause', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])

    await getAcceptedFriendIds('viewer')

    expect(mockPrisma.friendship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: FriendshipStatus.ACCEPTED,
          OR: [{ userAId: 'viewer' }, { userBId: 'viewer' }],
        },
      })
    )
  })

  it('excludes PENDING friendships (prisma only returns ACCEPTED rows)', async () => {
    // The WHERE status=ACCEPTED filter means prisma returns nothing for PENDING rows.
    // Simulate: a user whose only relationship is PENDING → prisma returns [].
    mockPrisma.friendship.findMany.mockResolvedValue([])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual([])
  })

  it('excludes BLOCKED friendships (prisma only returns ACCEPTED rows)', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual([])
  })

  it('returns [] when the user has no friendships at all', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual([])
  })

  it('never returns the viewer userId itself (self-exclusion gate)', async () => {
    // Defensive: even if a row somehow has the viewer on both arms, self is excluded.
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'viewer', userBId: 'viewer' }])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual([])
    expect(result).not.toContain('viewer')
  })

  it('deduplicates if the same friend id would appear more than once', async () => {
    // Simulates a schema anomaly — the @@unique constraint prevents this in practice,
    // but the Set-based deduplication handles it defensively.
    mockPrisma.friendship.findMany.mockResolvedValue([
      { userAId: 'viewer', userBId: 'friend-X' },
      { userAId: 'viewer', userBId: 'friend-X' },
    ])

    const result = await getAcceptedFriendIds('viewer')

    expect(result).toEqual(['friend-X'])
  })
})
