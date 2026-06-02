import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreakStatus } from '@prisma/client'

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
  getActiveStreaksV2ForEvaluation,
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
      lastVerifiedDate: '2024-01-14',
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
        lastVerifiedDate: true,
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
  it('updates streak fields', async () => {
    mockPrisma.streak.update.mockResolvedValue({})

    await updateStreak('user-1', {
      current: 6,
      best: 10,
      status: StreakStatus.ACTIVE,
      lastVerifiedDate: '2024-01-15',
      brokenAt: null,
    })

    expect(mockPrisma.streak.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { current: 6, best: 10, status: StreakStatus.ACTIVE, lastVerifiedDate: '2024-01-15', brokenAt: null },
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

describe('getActiveStreaksV2ForEvaluation', () => {
  it('queries ACTIVE streaks with lastVerifiedDate and user timezone', async () => {
    const rows = [
      {
        id: 'streak-1',
        userId: 'user-1',
        current: 3,
        status: StreakStatus.ACTIVE,
        lastVerifiedDate: '2024-01-14',
        user: { timezone: 'America/New_York' },
      },
    ]
    mockPrisma.streak.findMany.mockResolvedValue(rows)

    const result = await getActiveStreaksV2ForEvaluation()

    expect(result).toEqual(rows)
    expect(mockPrisma.streak.findMany).toHaveBeenCalledWith({
      where: { status: StreakStatus.ACTIVE },
      select: {
        id: true,
        userId: true,
        current: true,
        status: true,
        lastVerifiedDate: true,
        user: { select: { timezone: true } },
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
      }),
    })
  })
})

describe('getPostCreatedAt', () => {
  it('returns createdAt when post found', async () => {
    const createdAt = new Date('2024-01-15T10:00:00Z')
    mockPrisma.post.findUnique.mockResolvedValue({ createdAt })

    const result = await getPostCreatedAt('post-1')

    expect(result).toEqual(createdAt)
  })

  it('returns null when post not found', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null)
    expect(await getPostCreatedAt('ghost')).toBeNull()
  })
})
