import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../server/core/middleware/auth')
vi.mock('../../../server/core/middleware/validate')
vi.mock('../../../server/modules/feed/feed.service')

import { handleGetFeed } from '../../../server/modules/feed/feed.controller'
import * as authMiddleware from '../../../server/core/middleware/auth'
import * as validateMiddleware from '../../../server/core/middleware/validate'
import * as feedService from '../../../server/modules/feed/feed.service'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ValidationError } from '../../../server/core/errors/AppError'

// Arguments are evaluated before the mocked validateQuery receives them, so
// request.nextUrl.searchParams must exist even though validateQuery is mocked.
const mockRequest = {
  nextUrl: { searchParams: new URLSearchParams() },
} as unknown as NextRequest

const MOCK_QUERY = { limit: 20 as const }
const MOCK_FEED = { posts: [], nextCursor: null, emptyReason: 'NO_CONNECTIONS' as const }

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 401 — unauthenticated
// ---------------------------------------------------------------------------
describe('handleGetFeed — 401 Unauthorized', () => {
  it('returns 401 when requireAuth returns a NextResponse (no session)', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(
      NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 })
    )

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(401)
  })

  it('does not call getFeed when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(
      NextResponse.json({}, { status: 401 })
    )

    await handleGetFeed(mockRequest)

    expect(feedService.getFeed).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 400 — query validation failure (validateQuery returns NextResponse)
// ---------------------------------------------------------------------------
describe('handleGetFeed — 400 from query validation', () => {
  it('returns 400 when validateQuery rejects the limit', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(
      NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'limit', message: 'Too big' }] } },
        { status: 400 }
      )
    )

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(400)
  })

  it('does not call getFeed when validation fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(
      NextResponse.json({}, { status: 400 })
    )

    await handleGetFeed(mockRequest)

    expect(feedService.getFeed).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 400 — AppError thrown by service (e.g. malformed cursor passes validateQuery
//        but fails inside parseCursor inside getFeed)
// ---------------------------------------------------------------------------
describe('handleGetFeed — 400 from service ValidationError', () => {
  it('returns 400 when getFeed throws a ValidationError', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(MOCK_QUERY)
    vi.mocked(feedService.getFeed).mockRejectedValue(
      new ValidationError([{ field: 'cursor', message: 'Cursor has expired or is invalid' }])
    )

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ---------------------------------------------------------------------------
// 200 — happy path
// ---------------------------------------------------------------------------
describe('handleGetFeed — 200 success', () => {
  beforeEach(() => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(MOCK_QUERY)
  })

  it('returns 200 with the feed response body', async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue(MOCK_FEED)

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.posts).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.emptyReason).toBe('NO_CONNECTIONS')
  })

  it('calls getFeed with the authenticated userId and parsed query', async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue(MOCK_FEED)

    await handleGetFeed(mockRequest)

    expect(feedService.getFeed).toHaveBeenCalledWith('user-1', MOCK_QUERY)
  })

  it('includes nextCursor in the response when set', async () => {
    vi.mocked(feedService.getFeed).mockResolvedValue({
      posts: [
        {
          id: 'p1',
          imageUrl: 'https://cdn.example.com/p1.jpg',
          caption: null,
          createdAt: '2026-06-03T10:00:00.000Z',
          user: { id: 'user-2', username: 'bob', avatarUrl: null, streak: { current: 5 } },
          workout: { type: 'GYM' },
        },
      ],
      nextCursor: 'eyJ0Ijo...',
    })

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.posts).toHaveLength(1)
    expect(body.nextCursor).toBe('eyJ0Ijo...')
    expect(body.emptyReason).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 500 — unexpected error (no detail leak)
// ---------------------------------------------------------------------------
describe('handleGetFeed — 500 unexpected error', () => {
  beforeEach(() => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(validateMiddleware.validateQuery).mockReturnValue(MOCK_QUERY)
  })

  it('returns 500 when getFeed throws an unexpected error', async () => {
    vi.mocked(feedService.getFeed).mockRejectedValue(new Error('database connection lost'))

    const response = await handleGetFeed(mockRequest)

    expect(response.status).toBe(500)
  })

  it('returns INTERNAL_ERROR code without leaking error details', async () => {
    vi.mocked(feedService.getFeed).mockRejectedValue(new Error('database connection lost'))

    const response = await handleGetFeed(mockRequest)

    const body = await response.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('database connection lost')
  })
})
