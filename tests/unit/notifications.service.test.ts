import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRepo = vi.hoisted(() => ({
  createNotification: vi.fn(),
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
  markNotificationsRead: vi.fn(),
}))

vi.mock('../../server/modules/notifications/notifications.repo', () => mockRepo)

import {
  getNotifications,
  markRead,
} from '../../server/modules/notifications/notifications.service'

const NOW = new Date('2026-06-06T12:00:00Z')

const makeRow = (overrides: Partial<{ id: string; read: boolean; createdAt: Date }> = {}) => ({
  id: overrides.id ?? 'notif-1',
  type: 'WELCOME',
  title: 'Welcome!',
  body: null,
  data: null,
  read: overrides.read ?? false,
  createdAt: overrides.createdAt ?? NOW,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockRepo.getUnreadCount.mockResolvedValue(0)
  mockRepo.listNotifications.mockResolvedValue([])
  mockRepo.markNotificationsRead.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// getNotifications
// ---------------------------------------------------------------------------

describe('getNotifications', () => {
  it('returns empty list + zero unread when no notifications', async () => {
    const result = await getNotifications('user-1', undefined, 20)
    expect(result.notifications).toEqual([])
    expect(result.unreadCount).toBe(0)
    expect(result.nextCursor).toBeNull()
  })

  it('serialises createdAt to ISO string', async () => {
    mockRepo.listNotifications.mockResolvedValue([makeRow()])
    mockRepo.getUnreadCount.mockResolvedValue(1)
    const result = await getNotifications('user-1', undefined, 20)
    expect(result.notifications[0]?.createdAt).toBe(NOW.toISOString())
  })

  it('detects hasMore when repo returns limit+1 rows', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeRow({ id: `n-${i}`, createdAt: new Date(NOW.getTime() - i * 1000) })
    )
    mockRepo.listNotifications.mockResolvedValue(rows)
    const result = await getNotifications('user-1', undefined, 20)
    expect(result.notifications).toHaveLength(20)
    expect(result.nextCursor).not.toBeNull()
  })

  it('nextCursor is null when exactly limit rows returned', async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeRow({ id: `n-${i}`, createdAt: new Date(NOW.getTime() - i * 1000) })
    )
    mockRepo.listNotifications.mockResolvedValue(rows)
    const result = await getNotifications('user-1', undefined, 20)
    expect(result.notifications).toHaveLength(20)
    expect(result.nextCursor).toBeNull()
  })

  it('returns unreadCount from parallel count query', async () => {
    mockRepo.getUnreadCount.mockResolvedValue(7)
    const result = await getNotifications('user-1', undefined, 20)
    expect(result.unreadCount).toBe(7)
  })

  it('passes decoded cursor to repo on subsequent pages', async () => {
    // Build a valid cursor by encoding it first from a previous call
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeRow({ id: `n-${i}`, createdAt: new Date(NOW.getTime() - i * 1000) })
    )
    mockRepo.listNotifications.mockResolvedValue(rows)
    const first = await getNotifications('user-1', undefined, 20)
    const cursor = first.nextCursor!

    // Second call — cursor should be decoded and passed to repo
    mockRepo.listNotifications.mockResolvedValue([])
    await getNotifications('user-1', cursor, 20)
    expect(mockRepo.listNotifications).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ id: expect.any(String), createdAt: expect.any(Date) }),
      20
    )
  })

  it('passes null cursor for corrupted/missing cursor string', async () => {
    mockRepo.listNotifications.mockResolvedValue([])
    await getNotifications('user-1', 'not-valid-base64url!!!', 20)
    expect(mockRepo.listNotifications).toHaveBeenCalledWith('user-1', null, 20)
  })
})

// ---------------------------------------------------------------------------
// markRead
// ---------------------------------------------------------------------------

describe('markRead', () => {
  it('calls markNotificationsRead(userId, null) when all: true', async () => {
    await markRead('user-1', { all: true })
    expect(mockRepo.markNotificationsRead).toHaveBeenCalledWith('user-1', null)
  })

  it('calls markNotificationsRead with ids when notificationIds provided', async () => {
    await markRead('user-1', { notificationIds: ['n-1', 'n-2'] })
    expect(mockRepo.markNotificationsRead).toHaveBeenCalledWith('user-1', ['n-1', 'n-2'])
  })

  it('does not call repo when neither all nor ids given', async () => {
    await markRead('user-1', {})
    expect(mockRepo.markNotificationsRead).not.toHaveBeenCalled()
  })

  it('prefers all over notificationIds when both provided', async () => {
    await markRead('user-1', { all: true, notificationIds: ['n-1'] })
    expect(mockRepo.markNotificationsRead).toHaveBeenCalledWith('user-1', null)
  })
})
