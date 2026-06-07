import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationType } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  notification: {
    upsert: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
}))

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  createNotification,
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
} from '../../server/modules/notifications/notifications.repo'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.notification.upsert.mockResolvedValue({})
  mockPrisma.notification.create.mockResolvedValue({})
  mockPrisma.notification.findMany.mockResolvedValue([])
  mockPrisma.notification.count.mockResolvedValue(0)
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 })
})

const BASE_PARAMS = {
  userId: 'user-1',
  type: NotificationType.FRIEND_REQUEST,
  title: '@alice wants to be friends',
  data: { friendshipId: 'f-1', fromUserId: 'alice' },
}

// ---------------------------------------------------------------------------
// Idempotency via upsert
// ---------------------------------------------------------------------------

describe('createNotification — with idempotencyKey (upsert path)', () => {
  it('calls prisma.notification.upsert when idempotencyKey is provided', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'friendship:f-1:FRIEND_REQUEST' })
    expect(mockPrisma.notification.upsert).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
  })

  it('upserts with the correct idempotencyKey in the where clause', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'friendship:f-1:FRIEND_REQUEST' })
    expect(mockPrisma.notification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'friendship:f-1:FRIEND_REQUEST' },
      })
    )
  })

  it('upsert update is an empty object — no-op on duplicate key', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'friendship:f-1:FRIEND_REQUEST' })
    const call = mockPrisma.notification.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call?.['update']).toEqual({})
  })

  it('create block contains all required fields', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'friendship:f-1:FRIEND_REQUEST' })
    const call = mockPrisma.notification.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    const create = call?.['create'] as Record<string, unknown>
    expect(create).toMatchObject({
      userId: 'user-1',
      type: NotificationType.FRIEND_REQUEST,
      title: '@alice wants to be friends',
      idempotencyKey: 'friendship:f-1:FRIEND_REQUEST',
    })
  })

  it('is safe to call twice with the same key — second call is a no-op (upsert guarantees this)', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'k-1' })
    await createNotification({ ...BASE_PARAMS, idempotencyKey: 'k-1' })
    // Both calls go through upsert — DB constraint handles de-duplication
    expect(mockPrisma.notification.upsert).toHaveBeenCalledTimes(2)
    expect(mockPrisma.notification.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Fallback to create when no idempotencyKey
// ---------------------------------------------------------------------------

describe('createNotification — without idempotencyKey (create path)', () => {
  it('calls prisma.notification.create when idempotencyKey is not provided', async () => {
    await createNotification(BASE_PARAMS)
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.upsert).not.toHaveBeenCalled()
  })

  it('calls prisma.notification.create when idempotencyKey is null', async () => {
    await createNotification({ ...BASE_PARAMS, idempotencyKey: null })
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.notification.upsert).not.toHaveBeenCalled()
  })

  it('create block contains all required fields', async () => {
    await createNotification(BASE_PARAMS)
    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.FRIEND_REQUEST,
          title: '@alice wants to be friends',
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// FRIEND_ACCEPTED type
// ---------------------------------------------------------------------------

describe('createNotification — FRIEND_ACCEPTED type', () => {
  it('accepts FRIEND_ACCEPTED notification type', async () => {
    await createNotification({
      userId: 'requester',
      type: NotificationType.FRIEND_ACCEPTED,
      title: '@bob accepted your friend request',
      data: { friendshipId: 'f-1' },
      idempotencyKey: 'friendship:f-1:FRIEND_ACCEPTED',
    })
    const call = mockPrisma.notification.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    const create = call?.['create'] as Record<string, unknown>
    expect(create).toMatchObject({ type: NotificationType.FRIEND_ACCEPTED })
  })
})

// ===========================================================================
// READ PATH + IDOR SAFETY (Slice 7 audit — Critical Fix #2)
// ===========================================================================

interface Row {
  id: string
  userId: string
  read: boolean
  createdAt: Date
  type: string
  title: string
  body: string | null
  data: unknown
}

type WhereClause = {
  userId?: string
  read?: boolean
  id?: { in: string[] }
  OR?: Array<{ createdAt?: Date | { lt: Date }; id?: { lt: string } }>
}

// Faithful in-memory evaluation of the exact where clauses the repo builds.
// If a future edit drops `userId` from any where, these matchers stop filtering
// by owner and the behavioural tests below fail — which is the whole point.
function matchesWhere(row: Row, where: WhereClause): boolean {
  if (where.userId !== undefined && row.userId !== where.userId) return false
  if (where.read !== undefined && row.read !== where.read) return false
  if (where.id?.in && !where.id.in.includes(row.id)) return false
  if (where.OR) {
    const ok = where.OR.some((c) => {
      if (c.createdAt instanceof Date) {
        // keyset clause 2: createdAt equal AND id < cursor.id
        return (
          c.id?.lt !== undefined &&
          row.createdAt.getTime() === c.createdAt.getTime() &&
          row.id < c.id.lt
        )
      }
      if (c.createdAt && 'lt' in c.createdAt) {
        // keyset clause 1: createdAt strictly older than cursor.createdAt
        return row.createdAt.getTime() < c.createdAt.lt.getTime()
      }
      return false
    })
    if (!ok) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Query construction — the userId filter is the IDOR guard. These pin it so a
// future refactor that drops it fails loudly.
// ---------------------------------------------------------------------------

describe('listNotifications — query construction', () => {
  it('scopes by userId, orders by (createdAt desc, id desc), takes limit+1', async () => {
    await listNotifications('alice', null, 20)
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'alice' }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      })
    )
  })

  it('adds the keyset OR clause (and keeps userId) when a cursor is provided', async () => {
    const cursor = { createdAt: new Date('2026-01-02T00:00:00Z'), id: 'a2' }
    await listNotifications('alice', cursor, 10)
    const arg = mockPrisma.notification.findMany.mock.calls.at(-1)?.[0] as {
      where: WhereClause
      take: number
    }
    expect(arg.where.userId).toBe('alice')
    expect(arg.where.OR).toEqual([
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ])
    expect(arg.take).toBe(11)
  })
})

describe('getUnreadCount — query construction', () => {
  it('counts only unread rows for the given user', async () => {
    await getUnreadCount('alice')
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'alice', read: false },
    })
  })
})

describe('markNotificationsRead — query construction (IDOR guard lives in the where clause)', () => {
  it('ALWAYS includes userId in the where, even when ids are supplied', async () => {
    await markNotificationsRead('alice', ['x', 'y'])
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'alice', read: false, id: { in: ['x', 'y'] } },
      data: { read: true },
    })
  })

  it('omits the id filter for mark-all but keeps userId', async () => {
    await markNotificationsRead('alice', null)
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'alice', read: false },
      data: { read: true },
    })
  })
})

// ---------------------------------------------------------------------------
// Behavioural IDOR proof — a simulated table that actually applies the where.
// These fail if the userId filter is ever removed from the repo queries.
// ---------------------------------------------------------------------------

describe('IDOR safety — user-scoped reads/updates (in-memory simulation)', () => {
  let store: Row[]

  beforeEach(() => {
    store = [
      { id: 'a1', userId: 'alice', read: false, createdAt: new Date('2026-01-01T00:00:00Z'), type: 'WELCOME', title: '', body: null, data: null },
      { id: 'a2', userId: 'alice', read: false, createdAt: new Date('2026-01-02T00:00:00Z'), type: 'WELCOME', title: '', body: null, data: null },
      { id: 'b1', userId: 'bob', read: false, createdAt: new Date('2026-01-03T00:00:00Z'), type: 'WELCOME', title: '', body: null, data: null },
    ]
    mockPrisma.notification.updateMany.mockImplementation(
      (args: { where: WhereClause; data: Partial<Row> }) => {
        let count = 0
        for (const r of store) {
          if (matchesWhere(r, args.where)) {
            Object.assign(r, args.data)
            count++
          }
        }
        return Promise.resolve({ count })
      }
    )
    mockPrisma.notification.count.mockImplementation((args: { where: WhereClause }) =>
      Promise.resolve(store.filter((r) => matchesWhere(r, args.where)).length)
    )
    mockPrisma.notification.findMany.mockImplementation(
      (args: { where: WhereClause; take?: number }) => {
        const rows = store
          .filter((r) => matchesWhere(r, args.where))
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1))
        return Promise.resolve(args.take ? rows.slice(0, args.take) : rows)
      }
    )
  })

  it("bob cannot mark alice's notification read (cross-user id is a no-op)", async () => {
    await markNotificationsRead('bob', ['a1'])
    expect(store.find((r) => r.id === 'a1')?.read).toBe(false)
  })

  it('cross-user ids update ZERO rows', async () => {
    await markNotificationsRead('bob', ['a1', 'a2'])
    expect(store.filter((r) => r.read).length).toBe(0)
  })

  it('owner can mark only their own specified id', async () => {
    await markNotificationsRead('alice', ['a1'])
    expect(store.find((r) => r.id === 'a1')?.read).toBe(true)
    expect(store.find((r) => r.id === 'a2')?.read).toBe(false)
    expect(store.find((r) => r.id === 'b1')?.read).toBe(false)
  })

  it('mark-all affects only the caller’s rows, never another user’s', async () => {
    await markNotificationsRead('alice', null)
    expect(store.find((r) => r.id === 'a1')?.read).toBe(true)
    expect(store.find((r) => r.id === 'a2')?.read).toBe(true)
    expect(store.find((r) => r.id === 'b1')?.read).toBe(false)
  })

  it('getUnreadCount counts only the caller’s unread rows', async () => {
    expect(await getUnreadCount('alice')).toBe(2)
    expect(await getUnreadCount('bob')).toBe(1)
    await markNotificationsRead('alice', null)
    expect(await getUnreadCount('alice')).toBe(0)
    expect(await getUnreadCount('bob')).toBe(1)
  })

  it('listNotifications returns only the caller’s rows', async () => {
    const alice = await listNotifications('alice', null, 20)
    expect(alice.map((r) => r.id).sort()).toEqual(['a1', 'a2'])
    const bob = await listNotifications('bob', null, 20)
    expect(bob.map((r) => r.id)).toEqual(['b1'])
  })

  it('listNotifications keyset cursor returns the strictly-older page (still user-scoped)', async () => {
    // Cursor at a2 (2026-01-02) → only a1 (2026-01-01) is older, and only alice's.
    const page = await listNotifications('alice', { createdAt: new Date('2026-01-02T00:00:00Z'), id: 'a2' }, 20)
    expect(page.map((r) => r.id)).toEqual(['a1'])
  })
})
