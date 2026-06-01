import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus, UserActivityState } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  streak: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  post: {
    findUnique: vi.fn(),
  },
  event: {
    create: vi.fn(),
  },
}))

vi.mock('../../../app/web/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  getStreakByUserId,
  updateStreak,
  markStreakBroken,
  getActiveStreaksForEvaluation,
  persistStreakEvent,
  getPostCreatedAt,
} from '../../../server/modules/streaks/streaks.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getStreakByUserId', () => {
  it('returns streak when found', async () => {
    const streak = {
      id: 'streak-1',
      userId: 'user-1',
      current: 5,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt: new Date('2024-01-14T10:00:00Z'),
      brokenAt: null,
    }
    mockPrisma.streak.findUnique.mockResolvedValue(streak)

    const result = await getStreakByUserId('user-1')

    expect(result).toEqual(streak)
    expect(mockPrisma.streak.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        userId: true,
        current: true,
        best: true,
        status: true,
        lastVerifiedAt: true,
        brokenAt: true,
      },
    })
  })

  it('returns null when not found', async () => {
    mockPrisma.streak.findUnique.mockResolvedValue(null)
    const result = await getStreakByUserId('user-ghost')
    expect(result).toBeNull()
  })
})

describe('updateStreak', () => {
  it('updates all streak fields', async () => {
    mockPrisma.streak.update.mockResolvedValue({})
    const lastVerifiedAt = new Date('2024-01-15T10:00:00Z')

    await updateStreak('user-1', {
      current: 6,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedAt,
      brokenAt: null,
    })

    expect(mockPrisma.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { current: 6, best: 10, status: StreakStatus.ACTIVE, lastVerifiedAt, brokenAt: null },
    })
  })
})

describe('markStreakBroken', () => {
  it('sets status BROKEN and records brokenAt timestamp', async () => {
    mockPrisma.streak.update.mockResolvedValue({})
    const brokenAt = new Date('2024-01-15T11:00:00Z')

    await markStreakBroken('user-1', brokenAt)

    expect(mockPrisma.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { status: StreakStatus.BROKEN, brokenAt },
    })
  })
})

describe('getActiveStreaksForEvaluation', () => {
  it('queries ACTIVE streaks with non-null lastVerifiedAt and user activityState', async () => {
    const rows = [
      {
        id: 'streak-1',
        userId: 'user-1',
        current: 3,
        status: StreakStatus.ACTIVE,
        lastVerifiedAt: new Date('2024-01-14T10:00:00Z'),
        user: { activityState: UserActivityState.ACTIVE },
      },
    ]
    mockPrisma.streak.findMany.mockResolvedValue(rows)

    const result = await getActiveStreaksForEvaluation()

    expect(result).toEqual(rows)
    expect(mockPrisma.streak.findMany).toHaveBeenCalledWith({
      where: { status: StreakStatus.ACTIVE, lastVerifiedAt: { not: null } },
      select: {
        id: true,
        userId: true,
        current: true,
        status: true,
        lastVerifiedAt: true,
        user: { select: { activityState: true } },
      },
    })
  })
})

describe('persistStreakEvent', () => {
  it('inserts event row into the events table', async () => {
    mockPrisma.event.create.mockResolvedValue({ id: 'event-1' })

    await persistStreakEvent({
      type: 'STREAK_UPDATED',
      userId: 'user-1',
      payload: { current: 6, best: 10, status: 'ACTIVE' },
      source: 'streaks.service',
    })

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STREAK_UPDATED',
        userId: 'user-1',
        source: 'streaks.service',
        correlationId: null,
      }),
    })
  })

  it('passes correlationId when provided', async () => {
    mockPrisma.event.create.mockResolvedValue({ id: 'event-2' })

    await persistStreakEvent({
      type: 'STREAK_BROKEN',
      userId: 'user-1',
      payload: {},
      source: 'streak.evaluator',
      correlationId: 'corr-123',
    })

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ correlationId: 'corr-123' }),
    })
  })
})

describe('getPostCreatedAt', () => {
  it('returns post createdAt when post exists', async () => {
    const createdAt = new Date('2024-01-15T10:00:00Z')
    mockPrisma.post.findUnique.mockResolvedValue({ createdAt })

    const result = await getPostCreatedAt('post-1')

    expect(result).toEqual(createdAt)
    expect(mockPrisma.post.findUnique).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      select: { createdAt: true },
    })
  })

  it('returns null when post not found', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    const result = await getPostCreatedAt('ghost-post')
    expect(result).toBeNull()
  })
})
