import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendshipStatus } from '@prisma/client'
import { ConflictError, ForbiddenError, NotFoundError } from '../../server/core/errors/AppError'

vi.mock('../../server/modules/friends/friends.repo')
vi.mock('../../server/modules/users/users.service')
vi.mock('../../server/modules/notifications/notifications.service')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import {
  getAcceptedFriendIds,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getPendingFriendships,
} from '../../server/modules/friends/friends.service'
import * as repo from '../../server/modules/friends/friends.repo'
import * as usersService from '../../server/modules/users/users.service'
import * as notificationsService from '../../server/modules/notifications/notifications.service'

const MOCK_PROFILE = {
  id: 'target-1',
  email: 't@b.com',
  username: 'target',
  displayName: null,
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  onboarded: true,
  createdAt: new Date(),
}

const PENDING_RECORD = {
  id: 'f-1',
  userAId: 'requester',
  userBId: 'recipient',
  status: FriendshipStatus.PENDING,
  createdAt: new Date(),
}

const ACCEPTED_RECORD = {
  ...PENDING_RECORD,
  status: FriendshipStatus.ACCEPTED,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.persistEvent).mockResolvedValue(undefined)
  vi.mocked(usersService.getProfile).mockResolvedValue(MOCK_PROFILE)
  vi.mocked(notificationsService.createNotification).mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// getAcceptedFriendIds (existing)
// ---------------------------------------------------------------------------
describe('friends.service.getAcceptedFriendIds', () => {
  it('delegates to the repository with the correct userId', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue(['friend-1'])
    const result = await getAcceptedFriendIds('user-1')
    expect(repo.getAcceptedFriendIds).toHaveBeenCalledWith('user-1')
    expect(result).toEqual(['friend-1'])
  })

  it('passes through an empty result when there are no accepted friends', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue([])
    expect(await getAcceptedFriendIds('user-1')).toEqual([])
  })

  it('passes through multiple friend ids without transformation', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue(['a', 'b', 'c'])
    expect(await getAcceptedFriendIds('user-1')).toEqual(['a', 'b', 'c'])
  })

  it('calls the repository exactly once per invocation', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue([])
    await getAcceptedFriendIds('user-1')
    expect(repo.getAcceptedFriendIds).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// sendFriendRequest
// ---------------------------------------------------------------------------
describe('friends.service.sendFriendRequest', () => {
  it('creates a friendship and returns a mutation response', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)

    const result = await sendFriendRequest('requester', 'target-1')

    expect(repo.createFriendship).toHaveBeenCalledWith('requester', 'target-1')
    expect(result).toEqual({ friendship: { id: 'f-1', status: FriendshipStatus.PENDING } })
  })

  it('throws ConflictError on self-request before any repo call', async () => {
    await expect(sendFriendRequest('user-1', 'user-1')).rejects.toThrow(ConflictError)
    expect(usersService.getProfile).not.toHaveBeenCalled()
    expect(repo.findFriendshipBetween).not.toHaveBeenCalled()
  })

  it('propagates NotFoundError when target user does not exist', async () => {
    vi.mocked(usersService.getProfile).mockRejectedValue(new NotFoundError('User'))
    await expect(sendFriendRequest('requester', 'ghost')).rejects.toThrow(NotFoundError)
    expect(repo.createFriendship).not.toHaveBeenCalled()
  })

  it('throws ConflictError when a relationship already exists', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(PENDING_RECORD)
    await expect(sendFriendRequest('requester', 'target-1')).rejects.toThrow(ConflictError)
    expect(repo.createFriendship).not.toHaveBeenCalled()
  })

  it('emits FRIEND_REQUEST_SENT event (fire-and-forget)', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)

    await sendFriendRequest('requester', 'target-1')

    expect(repo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FRIEND_REQUEST_SENT',
        userId: 'requester',
        payload: expect.objectContaining({ friendshipId: 'f-1' }),
      })
    )
  })

  it('does not throw if event persistence fails', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.persistEvent).mockRejectedValue(new Error('DB error'))

    await expect(sendFriendRequest('requester', 'target-1')).resolves.toBeDefined()
  })

  it('validates target user existence and fetches requester profile for notification', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)

    await sendFriendRequest('requester', 'target-1')

    // Both profiles fetched concurrently — target for validation, requester for notification title
    expect(usersService.getProfile).toHaveBeenCalledWith('requester')
    expect(usersService.getProfile).toHaveBeenCalledWith('target-1')
  })

  it('creates a FRIEND_REQUEST notification for the recipient', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)

    await sendFriendRequest('requester', 'target-1')

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'target-1',
        title: `@${MOCK_PROFILE.username} wants to be friends`,
        idempotencyKey: `friendship:${PENDING_RECORD.id}:FRIEND_REQUEST`,
      })
    )
  })

  it('does not throw if notification creation fails', async () => {
    vi.mocked(repo.findFriendshipBetween).mockResolvedValue(null)
    vi.mocked(repo.createFriendship).mockResolvedValue(PENDING_RECORD)
    vi.mocked(notificationsService.createNotification).mockRejectedValue(new Error('notify fail'))

    await expect(sendFriendRequest('requester', 'target-1')).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// acceptFriendRequest
// ---------------------------------------------------------------------------
describe('friends.service.acceptFriendRequest', () => {
  it('updates status to ACCEPTED and returns mutation response', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.updateFriendshipStatus).mockResolvedValue(ACCEPTED_RECORD)

    const result = await acceptFriendRequest('recipient', 'f-1')

    expect(repo.updateFriendshipStatus).toHaveBeenCalledWith('f-1', FriendshipStatus.ACCEPTED)
    expect(result.friendship.status).toBe(FriendshipStatus.ACCEPTED)
  })

  it('throws NotFoundError when friendship does not exist', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(null)
    await expect(acceptFriendRequest('recipient', 'ghost')).rejects.toThrow(NotFoundError)
    expect(repo.updateFriendshipStatus).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError when caller is not the recipient (userBId)', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    await expect(acceptFriendRequest('requester', 'f-1')).rejects.toThrow(ForbiddenError)
    expect(repo.updateFriendshipStatus).not.toHaveBeenCalled()
  })

  it('throws ConflictError when friendship is not PENDING', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(ACCEPTED_RECORD)
    await expect(acceptFriendRequest('recipient', 'f-1')).rejects.toThrow(ConflictError)
    expect(repo.updateFriendshipStatus).not.toHaveBeenCalled()
  })

  it('emits FRIEND_REQUEST_ACCEPTED event', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.updateFriendshipStatus).mockResolvedValue(ACCEPTED_RECORD)

    await acceptFriendRequest('recipient', 'f-1')

    expect(repo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FRIEND_REQUEST_ACCEPTED' })
    )
  })

  it('creates a FRIEND_ACCEPTED notification for the original requester (userAId)', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.updateFriendshipStatus).mockResolvedValue(ACCEPTED_RECORD)

    await acceptFriendRequest('recipient', 'f-1')

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PENDING_RECORD.userAId,  // original requester, not the acceptor
        title: `@${MOCK_PROFILE.username} accepted your friend request`,
        idempotencyKey: `friendship:${PENDING_RECORD.id}:FRIEND_ACCEPTED`,
      })
    )
  })

  it('does not throw if notification creation fails', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.updateFriendshipStatus).mockResolvedValue(ACCEPTED_RECORD)
    vi.mocked(notificationsService.createNotification).mockRejectedValue(new Error('notify fail'))

    await expect(acceptFriendRequest('recipient', 'f-1')).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// rejectFriendRequest
// ---------------------------------------------------------------------------
describe('friends.service.rejectFriendRequest', () => {
  it('deletes the friendship row without emitting an event', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.deleteFriendship).mockResolvedValue(undefined)

    await rejectFriendRequest('recipient', 'f-1')

    expect(repo.deleteFriendship).toHaveBeenCalledWith('f-1')
    expect(repo.persistEvent).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when friendship does not exist', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(null)
    await expect(rejectFriendRequest('recipient', 'ghost')).rejects.toThrow(NotFoundError)
  })

  it('throws ForbiddenError when caller is not the recipient', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    await expect(rejectFriendRequest('requester', 'f-1')).rejects.toThrow(ForbiddenError)
  })

  it('throws ConflictError when friendship is not PENDING', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(ACCEPTED_RECORD)
    await expect(rejectFriendRequest('recipient', 'f-1')).rejects.toThrow(ConflictError)
  })
})

// ---------------------------------------------------------------------------
// removeFriend
// ---------------------------------------------------------------------------
describe('friends.service.removeFriend', () => {
  it('deletes an ACCEPTED friendship when called by userAId, emits FRIEND_REMOVED', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(ACCEPTED_RECORD)
    vi.mocked(repo.deleteFriendship).mockResolvedValue(undefined)

    await removeFriend('requester', 'f-1')

    expect(repo.deleteFriendship).toHaveBeenCalledWith('f-1')
    expect(repo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FRIEND_REMOVED' })
    )
  })

  it('deletes an ACCEPTED friendship when called by userBId, emits FRIEND_REMOVED', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(ACCEPTED_RECORD)
    vi.mocked(repo.deleteFriendship).mockResolvedValue(undefined)

    await removeFriend('recipient', 'f-1')

    expect(repo.deleteFriendship).toHaveBeenCalledWith('f-1')
    expect(repo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FRIEND_REMOVED' })
    )
  })

  it('allows requester (userAId) to cancel a PENDING request silently', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    vi.mocked(repo.deleteFriendship).mockResolvedValue(undefined)

    await removeFriend('requester', 'f-1')

    expect(repo.deleteFriendship).toHaveBeenCalledWith('f-1')
    expect(repo.persistEvent).not.toHaveBeenCalled() // cancel is silent
  })

  it('throws ForbiddenError when recipient tries to cancel a PENDING request via remove', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(PENDING_RECORD)
    await expect(removeFriend('recipient', 'f-1')).rejects.toThrow(ForbiddenError)
    expect(repo.deleteFriendship).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError for a non-participant', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(ACCEPTED_RECORD)
    await expect(removeFriend('outsider', 'f-1')).rejects.toThrow(ForbiddenError)
    expect(repo.deleteFriendship).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when friendship does not exist', async () => {
    vi.mocked(repo.findFriendshipById).mockResolvedValue(null)
    await expect(removeFriend('requester', 'ghost')).rejects.toThrow(NotFoundError)
  })
})

// ---------------------------------------------------------------------------
// getFriends
// ---------------------------------------------------------------------------
describe('friends.service.getFriends', () => {
  it('returns the correct friend when viewer is userAId', async () => {
    vi.mocked(repo.getAcceptedFriends).mockResolvedValue([
      {
        id: 'f-1', userAId: 'viewer', userBId: 'bob',
        userA: { id: 'viewer', username: 'alice', displayName: null, avatarUrl: null, streak: null },
        userB: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, streak: { current: 5 } },
      },
    ])

    const result = await getFriends('viewer')

    expect(result.friends).toHaveLength(1)
    expect(result.friends[0]?.username).toBe('bob')
    expect(result.friends[0]?.streak.current).toBe(5)
  })

  it('returns the correct friend when viewer is userBId', async () => {
    vi.mocked(repo.getAcceptedFriends).mockResolvedValue([
      {
        id: 'f-1', userAId: 'alice', userBId: 'viewer',
        userA: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null, streak: { current: 3 } },
        userB: { id: 'viewer', username: 'viewer', displayName: null, avatarUrl: null, streak: null },
      },
    ])

    const result = await getFriends('viewer')

    expect(result.friends[0]?.username).toBe('alice')
    expect(result.friends[0]?.streak.current).toBe(3)
  })

  it('defaults streak to { current: 0 } when streak row is null', async () => {
    vi.mocked(repo.getAcceptedFriends).mockResolvedValue([
      {
        id: 'f-1', userAId: 'viewer', userBId: 'bob',
        userA: { id: 'viewer', username: 'alice', displayName: null, avatarUrl: null, streak: null },
        userB: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null, streak: null },
      },
    ])

    const result = await getFriends('viewer')
    expect(result.friends[0]?.streak.current).toBe(0)
  })

  it('returns empty list when user has no accepted friends', async () => {
    vi.mocked(repo.getAcceptedFriends).mockResolvedValue([])
    expect((await getFriends('viewer')).friends).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getPendingFriendships
// ---------------------------------------------------------------------------
describe('friends.service.getPendingFriendships', () => {
  it('splits outgoing (viewer is userAId) and incoming (viewer is userBId)', async () => {
    vi.mocked(repo.getPendingFriendships).mockResolvedValue([
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
    ])

    const result = await getPendingFriendships('viewer')

    expect(result.outgoing).toHaveLength(1)
    expect(result.outgoing[0]?.friendshipId).toBe('f-out')
    expect(result.outgoing[0]?.user.username).toBe('bob')

    expect(result.incoming).toHaveLength(1)
    expect(result.incoming[0]?.friendshipId).toBe('f-in')
    expect(result.incoming[0]?.user.username).toBe('charlie')
  })

  it('returns empty lists when no pending requests exist', async () => {
    vi.mocked(repo.getPendingFriendships).mockResolvedValue([])
    const result = await getPendingFriendships('viewer')
    expect(result.incoming).toHaveLength(0)
    expect(result.outgoing).toHaveLength(0)
  })
})
