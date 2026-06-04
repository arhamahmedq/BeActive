import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendshipStatus } from '@prisma/client'

vi.mock('../../server/core/middleware/auth')
vi.mock('../../server/core/middleware/validate')
vi.mock('../../server/core/middleware/rateLimit')
vi.mock('../../server/modules/friends/friends.service')

import {
  handleSendFriendRequest,
  handleAcceptFriendRequest,
  handleRemoveFriend,
  handleBlockUser,
  handleGetFriends,
  handleRejectFriendRequest,
  handleGetPendingFriendships,
  handleSearchUsers,
} from '../../server/modules/friends/friends.controller'
import * as authMiddleware from '../../server/core/middleware/auth'
import * as validateMiddleware from '../../server/core/middleware/validate'
import * as rateLimitMiddleware from '../../server/core/middleware/rateLimit'
import * as friendsService from '../../server/modules/friends/friends.service'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../server/core/errors/AppError'

const mockRequest = {} as unknown as NextRequest

const MOCK_PENDING_RESPONSE = {
  friendship: { id: 'f-1', status: FriendshipStatus.PENDING },
}
const MOCK_ACCEPTED_RESPONSE = {
  friendship: { id: 'f-1', status: FriendshipStatus.ACCEPTED },
}
const MOCK_FRIENDS_LIST = {
  friends: [
    { id: 'u-2', friendshipId: 'f-1', username: 'bob', displayName: null, avatarUrl: null, streak: { current: 5 } },
  ],
}

const AUTH_SUCCESS = { userId: 'user-1' }
const AUTH_FAIL = NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 })
const VALIDATION_FAIL = NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed' } }, { status: 400 })

beforeEach(() => {
  vi.clearAllMocks()
  // Rate limit passes by default
  vi.mocked(rateLimitMiddleware.friendRequestUserRateLimit).mockReturnValue(null)
})

// ===========================================================================
// POST /api/friends/request — handleSendFriendRequest
// ===========================================================================

describe('handleSendFriendRequest — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    const res = await handleSendFriendRequest(mockRequest)
    expect(res.status).toBe(401)
  })

  it('does not call the service when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    await handleSendFriendRequest(mockRequest)
    expect(friendsService.sendFriendRequest).not.toHaveBeenCalled()
  })
})

describe('handleSendFriendRequest — 429 Rate Limited', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.friendRequestUserRateLimit).mockReturnValue(
      NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 })
    )
    const res = await handleSendFriendRequest(mockRequest)
    expect(res.status).toBe(429)
    expect(friendsService.sendFriendRequest).not.toHaveBeenCalled()
  })
})

describe('handleSendFriendRequest — 400 Validation', () => {
  it('returns 400 when body validation fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue(VALIDATION_FAIL)
    const res = await handleSendFriendRequest(mockRequest)
    expect(res.status).toBe(400)
    expect(friendsService.sendFriendRequest).not.toHaveBeenCalled()
  })
})

describe('handleSendFriendRequest — 409 Conflict', () => {
  it('returns 409 when friendship already exists', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'user-2' })
    vi.mocked(friendsService.sendFriendRequest).mockRejectedValue(
      new ConflictError('A friend request or friendship already exists between these users')
    )
    const res = await handleSendFriendRequest(mockRequest)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CONFLICT')
  })
})

describe('handleSendFriendRequest — 404 Not Found', () => {
  it('returns 404 when target user does not exist', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'ghost' })
    vi.mocked(friendsService.sendFriendRequest).mockRejectedValue(new NotFoundError('User'))
    const res = await handleSendFriendRequest(mockRequest)
    expect(res.status).toBe(404)
  })
})

describe('handleSendFriendRequest — 201 Created', () => {
  it('returns 201 with the friendship on success', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'user-2' })
    vi.mocked(friendsService.sendFriendRequest).mockResolvedValue(MOCK_PENDING_RESPONSE)

    const res = await handleSendFriendRequest(mockRequest)

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.friendship.id).toBe('f-1')
    expect(body.friendship.status).toBe(FriendshipStatus.PENDING)
  })

  it('calls sendFriendRequest with the authenticated userId and targetUserId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'user-2' })
    vi.mocked(friendsService.sendFriendRequest).mockResolvedValue(MOCK_PENDING_RESPONSE)

    await handleSendFriendRequest(mockRequest)

    expect(friendsService.sendFriendRequest).toHaveBeenCalledWith('user-1', 'user-2')
  })
})

describe('handleSendFriendRequest — 500 Unexpected', () => {
  it('returns 500 and does not leak error details', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'user-2' })
    vi.mocked(friendsService.sendFriendRequest).mockRejectedValue(new Error('db exploded'))

    const res = await handleSendFriendRequest(mockRequest)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('db exploded')
  })
})

// ===========================================================================
// POST /api/friends/accept — handleAcceptFriendRequest
// ===========================================================================

describe('handleAcceptFriendRequest — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleAcceptFriendRequest(mockRequest)).status).toBe(401)
    expect(friendsService.acceptFriendRequest).not.toHaveBeenCalled()
  })
})

describe('handleAcceptFriendRequest — 403 Forbidden', () => {
  it('returns 403 when caller is not the recipient', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.acceptFriendRequest).mockRejectedValue(new ForbiddenError())

    const res = await handleAcceptFriendRequest(mockRequest)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
  })
})

describe('handleAcceptFriendRequest — 404 Not Found', () => {
  it('returns 404 when friendship does not exist', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'ghost' })
    vi.mocked(friendsService.acceptFriendRequest).mockRejectedValue(new NotFoundError('Friend request'))

    expect((await handleAcceptFriendRequest(mockRequest)).status).toBe(404)
  })
})

describe('handleAcceptFriendRequest — 200 Success', () => {
  it('returns 200 with ACCEPTED friendship', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.acceptFriendRequest).mockResolvedValue(MOCK_ACCEPTED_RESPONSE)

    const res = await handleAcceptFriendRequest(mockRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.friendship.status).toBe(FriendshipStatus.ACCEPTED)
  })

  it('calls acceptFriendRequest with authenticated userId and friendshipId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.acceptFriendRequest).mockResolvedValue(MOCK_ACCEPTED_RESPONSE)

    await handleAcceptFriendRequest(mockRequest)
    expect(friendsService.acceptFriendRequest).toHaveBeenCalledWith('user-1', 'f-1')
  })
})

// ===========================================================================
// POST /api/friends/remove — handleRemoveFriend
// ===========================================================================

describe('handleRemoveFriend — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleRemoveFriend(mockRequest)).status).toBe(401)
    expect(friendsService.removeFriend).not.toHaveBeenCalled()
  })
})

describe('handleRemoveFriend — 403 Forbidden', () => {
  it('returns 403 when caller is not a participant', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.removeFriend).mockRejectedValue(new ForbiddenError())

    expect((await handleRemoveFriend(mockRequest)).status).toBe(403)
  })
})

describe('handleRemoveFriend — 200 Success', () => {
  it('returns 200 with success: true', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.removeFriend).mockResolvedValue(undefined)

    const res = await handleRemoveFriend(mockRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('calls removeFriend with authenticated userId and friendshipId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.removeFriend).mockResolvedValue(undefined)

    await handleRemoveFriend(mockRequest)
    expect(friendsService.removeFriend).toHaveBeenCalledWith('user-1', 'f-1')
  })
})

// ===========================================================================
// POST /api/friends/block — handleBlockUser
// ===========================================================================

describe('handleBlockUser', () => {
  const BLOCKED_RESPONSE = { friendship: { id: 'f-9', status: FriendshipStatus.BLOCKED } }

  it('returns 401 when auth fails (and does not call the service)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    const res = await handleBlockUser(mockRequest)
    expect(res.status).toBe(401)
    expect(friendsService.blockUser).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited (and does not call the service)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.friendActionUserRateLimit).mockReturnValue(
      NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 })
    )
    const res = await handleBlockUser(mockRequest)
    expect(res.status).toBe(429)
    expect(friendsService.blockUser).not.toHaveBeenCalled()
  })

  it('returns 400 when body validation fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.friendActionUserRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue(VALIDATION_FAIL)
    const res = await handleBlockUser(mockRequest)
    expect(res.status).toBe(400)
    expect(friendsService.blockUser).not.toHaveBeenCalled()
  })

  it('returns 200 and calls blockUser with the authenticated userId + targetUserId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.friendActionUserRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'u-2' })
    vi.mocked(friendsService.blockUser).mockResolvedValue(BLOCKED_RESPONSE)

    const res = await handleBlockUser(mockRequest)
    expect(res.status).toBe(200)
    expect(friendsService.blockUser).toHaveBeenCalledWith('user-1', 'u-2')
  })

  it('maps a service ConflictError (e.g. self-block) to 409', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.friendActionUserRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ targetUserId: 'user-1' })
    vi.mocked(friendsService.blockUser).mockRejectedValue(new ConflictError('You cannot block yourself'))

    const res = await handleBlockUser(mockRequest)
    expect(res.status).toBe(409)
  })
})

// ===========================================================================
// GET /api/friends — handleGetFriends
// ===========================================================================

describe('handleGetFriends — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleGetFriends(mockRequest)).status).toBe(401)
    expect(friendsService.getFriends).not.toHaveBeenCalled()
  })
})

describe('handleGetFriends — 200 Success', () => {
  it('returns 200 with the friends list', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getFriends).mockResolvedValue(MOCK_FRIENDS_LIST)

    const res = await handleGetFriends(mockRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.friends).toHaveLength(1)
    expect(body.friends[0].username).toBe('bob')
  })

  it('calls getFriends with the authenticated userId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getFriends).mockResolvedValue(MOCK_FRIENDS_LIST)

    await handleGetFriends(mockRequest)
    expect(friendsService.getFriends).toHaveBeenCalledWith('user-1')
  })

  it('returns an empty friends list when user has no friends', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getFriends).mockResolvedValue({ friends: [] })

    const res = await handleGetFriends(mockRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.friends).toHaveLength(0)
  })
})

describe('handleGetFriends — 500 Unexpected', () => {
  it('returns 500 without leaking error details', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getFriends).mockRejectedValue(new Error('db exploded'))

    const res = await handleGetFriends(mockRequest)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('db exploded')
  })
})

// ===========================================================================
// POST /api/friends/reject — handleRejectFriendRequest
// ===========================================================================

describe('handleRejectFriendRequest — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleRejectFriendRequest(mockRequest)).status).toBe(401)
    expect(friendsService.rejectFriendRequest).not.toHaveBeenCalled()
  })
})

describe('handleRejectFriendRequest — 403 Forbidden', () => {
  it('returns 403 when caller is not the recipient', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.rejectFriendRequest).mockRejectedValue(new ForbiddenError())
    expect((await handleRejectFriendRequest(mockRequest)).status).toBe(403)
  })
})

describe('handleRejectFriendRequest — 200 Success', () => {
  it('returns 200 with success: true', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.rejectFriendRequest).mockResolvedValue(undefined)

    const res = await handleRejectFriendRequest(mockRequest)
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('calls rejectFriendRequest with authenticated userId and friendshipId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ friendshipId: 'f-1' })
    vi.mocked(friendsService.rejectFriendRequest).mockResolvedValue(undefined)

    await handleRejectFriendRequest(mockRequest)
    expect(friendsService.rejectFriendRequest).toHaveBeenCalledWith('user-1', 'f-1')
  })
})

// ===========================================================================
// GET /api/friends/pending — handleGetPendingFriendships
// ===========================================================================

describe('handleGetPendingFriendships — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleGetPendingFriendships(mockRequest)).status).toBe(401)
    expect(friendsService.getPendingFriendships).not.toHaveBeenCalled()
  })
})

describe('handleGetPendingFriendships — 200 Success', () => {
  it('returns 200 with incoming and outgoing lists', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getPendingFriendships).mockResolvedValue({
      incoming: [{ friendshipId: 'f-in', user: { id: 'u-3', username: 'charlie', avatarUrl: null } }],
      outgoing: [],
    })

    const res = await handleGetPendingFriendships(mockRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.incoming).toHaveLength(1)
    expect(body.outgoing).toHaveLength(0)
  })

  it('calls getPendingFriendships with the authenticated userId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(friendsService.getPendingFriendships).mockResolvedValue({ incoming: [], outgoing: [] })

    await handleGetPendingFriendships(mockRequest)
    expect(friendsService.getPendingFriendships).toHaveBeenCalledWith('user-1')
  })
})

// ===========================================================================
// GET /api/users/search — handleSearchUsers
// ===========================================================================

const mockSearchRequest = {
  nextUrl: { searchParams: new URLSearchParams({ q: 'bob' }) },
} as unknown as NextRequest

describe('handleSearchUsers — 401 Unauthorized', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    expect((await handleSearchUsers(mockSearchRequest)).status).toBe(401)
    expect(friendsService.searchUsers).not.toHaveBeenCalled()
  })
})

describe('handleSearchUsers — 429 Rate Limited', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.userSearchRateLimit).mockReturnValue(
      NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 })
    )
    expect((await handleSearchUsers(mockSearchRequest)).status).toBe(429)
    expect(friendsService.searchUsers).not.toHaveBeenCalled()
  })
})

describe('handleSearchUsers — 400 Validation', () => {
  it('returns 400 when query param is invalid (e.g. q too short)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.userSearchRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(VALIDATION_FAIL)
    expect((await handleSearchUsers(mockSearchRequest)).status).toBe(400)
  })
})

describe('handleSearchUsers — 200 Success', () => {
  it('returns 200 with users list', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.userSearchRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue({ q: 'bob' })
    vi.mocked(friendsService.searchUsers).mockResolvedValue({
      users: [{ id: 'u-2', username: 'bob', avatarUrl: null }],
    })

    const res = await handleSearchUsers(mockSearchRequest)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(1)
    expect(body.users[0].username).toBe('bob')
  })

  it('calls searchUsers with query string and authenticated userId', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.userSearchRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue({ q: 'bob' })
    vi.mocked(friendsService.searchUsers).mockResolvedValue({ users: [] })

    await handleSearchUsers(mockSearchRequest)
    expect(friendsService.searchUsers).toHaveBeenCalledWith('bob', 'user-1')
  })

  it('returns empty array when no users match', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.userSearchRateLimit).mockReturnValue(null)
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue({ q: 'zzz' })
    vi.mocked(friendsService.searchUsers).mockResolvedValue({ users: [] })

    const res = await handleSearchUsers(mockSearchRequest)
    expect((await res.json()).users).toHaveLength(0)
  })
})
