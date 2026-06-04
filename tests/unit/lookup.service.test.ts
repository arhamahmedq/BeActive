import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendshipStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  friendship: {
    findFirst: vi.fn(),
  },
}))

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import { findFriendshipId } from '../../server/modules/friends/friends.lookup.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findFriendshipId', () => {
  it('returns the friendship id when a relationship exists in direction A→B', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue({
      id: 'f-1',
      userAId: 'alice',
      userBId: 'bob',
      status: FriendshipStatus.ACCEPTED,
      createdAt: new Date(),
    })

    const result = await findFriendshipId('alice', 'bob')
    expect(result).toBe('f-1')
  })

  it('returns the friendship id when a relationship exists in direction B→A', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue({
      id: 'f-2',
      userAId: 'bob',
      userBId: 'alice',
      status: FriendshipStatus.ACCEPTED,
      createdAt: new Date(),
    })

    const result = await findFriendshipId('alice', 'bob')
    expect(result).toBe('f-2')
  })

  it('returns null when no relationship exists', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(null)
    const result = await findFriendshipId('alice', 'charlie')
    expect(result).toBeNull()
  })

  it('delegates to findFriendshipBetween (queries both directions)', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(null)
    await findFriendshipId('alice', 'bob')
    expect(mockPrisma.friendship.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { userAId: 'alice', userBId: 'bob' },
            { userAId: 'bob', userBId: 'alice' },
          ],
        },
      })
    )
  })
})
