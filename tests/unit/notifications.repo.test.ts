import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationType } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  notification: {
    upsert: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import { createNotification } from '../../server/modules/notifications/notifications.repo'

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.notification.upsert.mockResolvedValue({})
  mockPrisma.notification.create.mockResolvedValue({})
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
