import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/core/middleware/auth')
vi.mock('../../server/core/middleware/validate')
vi.mock('../../server/core/middleware/rateLimit')
vi.mock('../../server/modules/interactions/interactions.service')

import {
  handleLikePost,
  handleUnlikePost,
  handleCreateComment,
  handleGetComments,
  handleDeleteComment,
} from '../../server/modules/interactions/interactions.controller'
import * as authMiddleware from '../../server/core/middleware/auth'
import * as validateMiddleware from '../../server/core/middleware/validate'
import * as rateLimitMiddleware from '../../server/core/middleware/rateLimit'
import * as service from '../../server/modules/interactions/interactions.service'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { NotFoundError, ForbiddenError } from '../../server/core/errors/AppError'

const mockRequest = { nextUrl: { searchParams: new URLSearchParams() } } as unknown as NextRequest
const AUTH_SUCCESS = { userId: 'user-1' }
const AUTH_FAIL = NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 })
const VALIDATION_FAIL = NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'x' } }, { status: 400 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rateLimitMiddleware.likeUserRateLimit).mockReturnValue(null)
  vi.mocked(rateLimitMiddleware.commentUserRateLimit).mockReturnValue(null)
  vi.mocked(rateLimitMiddleware.generalRateLimit).mockReturnValue(null)
})

describe('handleLikePost', () => {
  it('401 when auth fails (service untouched)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    const res = await handleLikePost(mockRequest, 'post-1')
    expect(res.status).toBe(401)
    expect(service.likePost).not.toHaveBeenCalled()
  })

  it('429 when rate limited', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(rateLimitMiddleware.likeUserRateLimit).mockReturnValue(
      NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'x' } }, { status: 429 }),
    )
    const res = await handleLikePost(mockRequest, 'post-1')
    expect(res.status).toBe(429)
    expect(service.likePost).not.toHaveBeenCalled()
  })

  it('200 and calls likePost(userId, postId)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.likePost).mockResolvedValue({ liked: true, likeCount: 1 })
    const res = await handleLikePost(mockRequest, 'post-1')
    expect(res.status).toBe(200)
    expect(service.likePost).toHaveBeenCalledWith('user-1', 'post-1')
  })

  it('maps a service NotFoundError to 404 (post not viewable)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.likePost).mockRejectedValue(new NotFoundError('Post'))
    const res = await handleLikePost(mockRequest, 'hidden')
    expect(res.status).toBe(404)
  })
})

describe('handleUnlikePost', () => {
  it('200 and calls unlikePost', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.unlikePost).mockResolvedValue({ liked: false, likeCount: 0 })
    const res = await handleUnlikePost(mockRequest, 'post-1')
    expect(res.status).toBe(200)
    expect(service.unlikePost).toHaveBeenCalledWith('user-1', 'post-1')
  })
})

describe('handleCreateComment', () => {
  it('400 when body validation fails (service untouched)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue(VALIDATION_FAIL)
    const res = await handleCreateComment(mockRequest, 'post-1')
    expect(res.status).toBe(400)
    expect(service.addComment).not.toHaveBeenCalled()
  })

  it('201 and calls addComment(userId, postId, body)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ body: 'nice' })
    vi.mocked(service.addComment).mockResolvedValue({
      id: 'c1', body: 'nice', createdAt: '2026-06-05T00:00:00.000Z',
      user: { id: 'user-1', username: 'v', avatarUrl: null },
    })
    const res = await handleCreateComment(mockRequest, 'post-1')
    expect(res.status).toBe(201)
    expect(service.addComment).toHaveBeenCalledWith('user-1', 'post-1', 'nice')
  })

  it('maps a service NotFoundError to 404', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateBody).mockResolvedValue({ body: 'hi' })
    vi.mocked(service.addComment).mockRejectedValue(new NotFoundError('Post'))
    const res = await handleCreateComment(mockRequest, 'hidden')
    expect(res.status).toBe(404)
  })
})

describe('handleGetComments', () => {
  it('200 and calls getComments with parsed query', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue({ cursor: undefined, limit: 20 })
    vi.mocked(service.getComments).mockResolvedValue({ comments: [], nextCursor: null })
    const res = await handleGetComments(mockRequest, 'post-1')
    expect(res.status).toBe(200)
    expect(service.getComments).toHaveBeenCalledWith('user-1', 'post-1', undefined, 20)
  })
})

describe('handleDeleteComment', () => {
  it('204 on success', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.deleteComment).mockResolvedValue(undefined)
    const res = await handleDeleteComment(mockRequest, 'post-1', 'c1')
    expect(res.status).toBe(204)
    expect(service.deleteComment).toHaveBeenCalledWith('user-1', 'post-1', 'c1')
  })

  it('401 when unauthenticated', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)
    const res = await handleDeleteComment(mockRequest, 'post-1', 'c1')
    expect(res.status).toBe(401)
    expect(service.deleteComment).not.toHaveBeenCalled()
  })

  it('404 when comment not found', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.deleteComment).mockRejectedValue(new NotFoundError('Comment'))
    const res = await handleDeleteComment(mockRequest, 'post-1', 'missing')
    expect(res.status).toBe(404)
  })

  it('403 when caller is not commenter or post author', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
    vi.mocked(service.deleteComment).mockRejectedValue(new ForbiddenError())
    const res = await handleDeleteComment(mockRequest, 'post-1', 'c1')
    expect(res.status).toBe(403)
  })
})
