import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendshipStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => {
  const p = {
    friendship: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    event: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
  // Interactive transaction: run the callback against the same mock client.
  p.$transaction.mockImplementation((cb: (tx: typeof p) => unknown) => cb(p))
  return p
})

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  getAcceptedFriendIds,
  findFriendshipBetween,
  findFriendshipById,
  createFriendship,
  updateFriendshipStatus,
  deleteFriendship,
  blockFriendship,
  findDirectedFriendship,
  getAcceptedFriends,
  getPendingFriendships,
  persistEvent,
  searchUsers,
} from '../../server/modules/friends/friends.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getAcceptedFriendIds (existing)
// ---------------------------------------------------------------------------
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

  it('returns [] when the user has no friendships at all', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])
    expect(await getAcceptedFriendIds('viewer')).toEqual([])
  })

  it('never returns the viewer userId itself (self-exclusion gate)', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([{ userAId: 'viewer', userBId: 'viewer' }])
    const result = await getAcceptedFriendIds('viewer')
    expect(result).toEqual([])
  })

  it('deduplicates if the same friend id would appear more than once', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([
      { userAId: 'viewer', userBId: 'friend-X' },
      { userAId: 'viewer', userBId: 'friend-X' },
    ])
    expect(await getAcceptedFriendIds('viewer')).toEqual(['friend-X'])
  })
})

// ---------------------------------------------------------------------------
// findFriendshipBetween
// ---------------------------------------------------------------------------
describe('friends.repo.findFriendshipBetween', () => {
  const MOCK_ROW = {
    id: 'f-1', userAId: 'alice', userBId: 'bob',
    status: FriendshipStatus.PENDING, createdAt: new Date(),
  }

  it('returns the row when found in direction A→B', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(MOCK_ROW)
    const result = await findFriendshipBetween('alice', 'bob')
    expect(result).toEqual(MOCK_ROW)
  })

  it('returns the row when found in direction B→A', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(MOCK_ROW)
    const result = await findFriendshipBetween('bob', 'alice')
    expect(result).toEqual(MOCK_ROW)
  })

  it('returns null when no relationship exists', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(null)
    expect(await findFriendshipBetween('alice', 'charlie')).toBeNull()
  })

  it('issues an OR query covering both directions', async () => {
    mockPrisma.friendship.findFirst.mockResolvedValue(null)
    await findFriendshipBetween('alice', 'bob')
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

// ---------------------------------------------------------------------------
// findFriendshipById
// ---------------------------------------------------------------------------
describe('friends.repo.findFriendshipById', () => {
  it('returns the row with all authorization fields', async () => {
    const mock = {
      id: 'f-1', userAId: 'alice', userBId: 'bob',
      status: FriendshipStatus.PENDING, createdAt: new Date(),
    }
    mockPrisma.friendship.findUnique.mockResolvedValue(mock)
    const result = await findFriendshipById('f-1')
    expect(result).toMatchObject({ id: 'f-1', userAId: 'alice', userBId: 'bob' })
  })

  it('returns null when not found', async () => {
    mockPrisma.friendship.findUnique.mockResolvedValue(null)
    expect(await findFriendshipById('nonexistent')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// createFriendship
// ---------------------------------------------------------------------------
describe('friends.repo.createFriendship', () => {
  it('creates with PENDING status and correct arm assignment', async () => {
    const mock = {
      id: 'f-1', userAId: 'alice', userBId: 'bob',
      status: FriendshipStatus.PENDING, createdAt: new Date(),
    }
    mockPrisma.friendship.create.mockResolvedValue(mock)

    const result = await createFriendship('alice', 'bob')

    expect(mockPrisma.friendship.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userAId: 'alice', userBId: 'bob', status: FriendshipStatus.PENDING },
      })
    )
    expect(result.status).toBe(FriendshipStatus.PENDING)
  })
})

// ---------------------------------------------------------------------------
// updateFriendshipStatus
// ---------------------------------------------------------------------------
describe('friends.repo.updateFriendshipStatus', () => {
  it('updates to ACCEPTED and returns the updated row', async () => {
    const mock = {
      id: 'f-1', userAId: 'alice', userBId: 'bob',
      status: FriendshipStatus.ACCEPTED, createdAt: new Date(),
    }
    mockPrisma.friendship.update.mockResolvedValue(mock)

    const result = await updateFriendshipStatus('f-1', FriendshipStatus.ACCEPTED)

    expect(mockPrisma.friendship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f-1' },
        data: { status: FriendshipStatus.ACCEPTED },
      })
    )
    expect(result.status).toBe(FriendshipStatus.ACCEPTED)
  })
})

// ---------------------------------------------------------------------------
// deleteFriendship
// ---------------------------------------------------------------------------
describe('friends.repo.deleteFriendship', () => {
  it('calls delete with the correct id', async () => {
    mockPrisma.friendship.delete.mockResolvedValue({})
    await deleteFriendship('f-1')
    expect(mockPrisma.friendship.delete).toHaveBeenCalledWith({ where: { id: 'f-1' } })
  })
})

// ---------------------------------------------------------------------------
// blockFriendship
// ---------------------------------------------------------------------------
describe('friends.repo.blockFriendship', () => {
  it('runs in a txn, directional delete (preserves the counter-party BLOCKED row) before creating BLOCKED', async () => {
    const blockedRow = { id: 'f-9', userAId: 'blocker', userBId: 'blocked', status: FriendshipStatus.BLOCKED, createdAt: new Date() }
    mockPrisma.friendship.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.friendship.create.mockResolvedValue(blockedRow)

    const result = await blockFriendship('blocker', 'blocked')

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    // F2: deletes the blocker's own row (any status) + the target's NON-block row,
    // but never the target's BLOCKED row (status: { not: BLOCKED }).
    expect(mockPrisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userAId: 'blocker', userBId: 'blocked' },
          { userAId: 'blocked', userBId: 'blocker', status: { not: FriendshipStatus.BLOCKED } },
        ],
      },
    })
    expect(result).toEqual(blockedRow)
  })

  it('creates the BLOCKED row with blocker as userAId (direction = who blocked whom)', async () => {
    mockPrisma.friendship.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.friendship.create.mockResolvedValue({})
    await blockFriendship('blocker', 'blocked')
    expect(mockPrisma.friendship.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userAId: 'blocker', userBId: 'blocked', status: FriendshipStatus.BLOCKED },
      })
    )
  })
})

// ---------------------------------------------------------------------------
// findDirectedFriendship
// ---------------------------------------------------------------------------
describe('friends.repo.findDirectedFriendship', () => {
  it('looks up exactly one ordered pair via the compound unique index', async () => {
    const row = { id: 'f-1', userAId: 'a', userBId: 'b', status: FriendshipStatus.BLOCKED, createdAt: new Date() }
    mockPrisma.friendship.findUnique.mockResolvedValue(row)
    const result = await findDirectedFriendship('a', 'b')
    expect(mockPrisma.friendship.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userAId_userBId: { userAId: 'a', userBId: 'b' } } })
    )
    expect(result).toEqual(row)
  })

  it('returns null when the directed pair does not exist', async () => {
    mockPrisma.friendship.findUnique.mockResolvedValue(null)
    expect(await findDirectedFriendship('a', 'b')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getAcceptedFriends
// ---------------------------------------------------------------------------
describe('friends.repo.getAcceptedFriends', () => {
  it('queries ACCEPTED rows for both arms of the viewer', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])
    await getAcceptedFriends('viewer')
    expect(mockPrisma.friendship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: FriendshipStatus.ACCEPTED,
          OR: [{ userAId: 'viewer' }, { userBId: 'viewer' }],
        },
      })
    )
  })

  it('includes nested user and streak fields in the select', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])
    await getAcceptedFriends('viewer')
    const call = mockPrisma.friendship.findMany.mock.calls[0]?.[0] as Record<string, unknown>
    const select = call?.['select'] as Record<string, unknown>
    expect(select).toHaveProperty('userA')
    expect(select).toHaveProperty('userB')
  })

  it('returns the raw rows for service-level arm resolution', async () => {
    const mock = [
      {
        id: 'f-1', userAId: 'viewer', userBId: 'bob',
        userA: { id: 'viewer', username: 'alice', displayName: null, avatarUrl: null, streak: null },
        userB: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, streak: { current: 5 } },
      },
    ]
    mockPrisma.friendship.findMany.mockResolvedValue(mock)
    const result = await getAcceptedFriends('viewer')
    expect(result).toHaveLength(1)
    expect(result[0]?.userBId).toBe('bob')
  })
})

// ---------------------------------------------------------------------------
// getPendingFriendships
// ---------------------------------------------------------------------------
describe('friends.repo.getPendingFriendships', () => {
  it('queries PENDING rows for both arms', async () => {
    mockPrisma.friendship.findMany.mockResolvedValue([])
    await getPendingFriendships('viewer')
    expect(mockPrisma.friendship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: FriendshipStatus.PENDING,
          OR: [{ userAId: 'viewer' }, { userBId: 'viewer' }],
        },
      })
    )
  })

  it('returns raw rows for service-level incoming/outgoing split', async () => {
    const mock = [
      {
        id: 'f-out', userAId: 'viewer', userBId: 'bob',
        userA: { id: 'viewer', username: 'alice', avatarUrl: null },
        userB: { id: 'bob', username: 'bob', avatarUrl: null },
      },
      {
        id: 'f-in', userAId: 'charlie', userBId: 'viewer',
        userA: { id: 'charlie', username: 'charlie', avatarUrl: null },
        userB: { id: 'viewer', username: 'alice', avatarUrl: null },
      },
    ]
    mockPrisma.friendship.findMany.mockResolvedValue(mock)
    const result = await getPendingFriendships('viewer')
    expect(result).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// persistEvent
// ---------------------------------------------------------------------------
describe('friends.repo.persistEvent', () => {
  it('creates an event row with the correct shape', async () => {
    mockPrisma.event.create.mockResolvedValue({})
    await persistEvent({
      type: 'FRIEND_REQUEST_SENT',
      userId: 'alice',
      payload: { friendshipId: 'f-1' },
      source: 'friends.service',
    })
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'FRIEND_REQUEST_SENT',
          userId: 'alice',
          source: 'friends.service',
        }),
      })
    )
  })

  it('sets correlationId to null when not provided', async () => {
    mockPrisma.event.create.mockResolvedValue({})
    await persistEvent({ type: 'T', userId: 'u', payload: {}, source: 's' })
    const data = (mockPrisma.event.create.mock.calls[0]?.[0] as Record<string, unknown>)?.['data']
    expect((data as Record<string, unknown>)?.['correlationId']).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// searchUsers
// ---------------------------------------------------------------------------
describe('friends.repo.searchUsers', () => {
  it('returns matching users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'u-2', username: 'bob', avatarUrl: null },
    ])
    const result = await searchUsers('bo', 'viewer')
    expect(result).toHaveLength(1)
    expect(result[0]?.username).toBe('bob')
  })

  it('issues a case-insensitive contains query on username', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    await searchUsers('alice', 'viewer')
    const call = mockPrisma.user.findMany.mock.calls[0]?.[0] as Record<string, unknown>
    const where = call?.['where'] as Record<string, unknown>
    expect(where?.['username']).toEqual({ contains: 'alice', mode: 'insensitive' })
  })

  it('excludes the requester from results', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    await searchUsers('alice', 'viewer')
    const call = mockPrisma.user.findMany.mock.calls[0]?.[0] as Record<string, unknown>
    const where = call?.['where'] as Record<string, unknown>
    expect(where?.['id']).toEqual({ not: 'viewer' })
  })

  it('includes the AND blocked-user exclusion filter (both arms)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    await searchUsers('alice', 'viewer')
    const call = mockPrisma.user.findMany.mock.calls[0]?.[0] as Record<string, unknown>
    const where = call?.['where'] as Record<string, unknown>
    const and = where?.['AND'] as unknown[]
    expect(and).toHaveLength(2)
    expect(JSON.stringify(and)).toContain('friendshipsA')
    expect(JSON.stringify(and)).toContain('friendshipsB')
    expect(JSON.stringify(and)).toContain('BLOCKED')
  })

  it('enforces the take: 20 hard cap', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    await searchUsers('alice', 'viewer')
    const call = mockPrisma.user.findMany.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call?.['take']).toBe(20)
  })

  it('returns an empty array when no users match', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    expect(await searchUsers('zzz', 'viewer')).toEqual([])
  })
})
