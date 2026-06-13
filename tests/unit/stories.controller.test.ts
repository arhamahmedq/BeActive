import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

vi.mock('../../server/core/middleware/auth')
vi.mock('../../server/core/middleware/rateLimit')
vi.mock('../../server/modules/stories/stories.service')

import { handleReportStoryShared } from '../../server/modules/stories/stories.controller'
import * as authMiddleware from '../../server/core/middleware/auth'
import * as rateLimitMiddleware from '../../server/core/middleware/rateLimit'
import * as storiesService from '../../server/modules/stories/stories.service'
import { NotFoundError } from '../../server/core/errors/AppError'

const AUTH_SUCCESS = { userId: 'user-1' }
const AUTH_FAIL = NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 })

function makeRequest(body: unknown): NextRequest {
  return { json: vi.fn().mockResolvedValue(body) } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rateLimitMiddleware.generalRateLimit).mockResolvedValue(null)
  vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_SUCCESS)
})

describe('handleReportStoryShared', () => {
  it('returns 401 when auth fails', async () => {
    vi.mocked(authMiddleware.requireAuth).mockResolvedValue(AUTH_FAIL)

    const res = await handleReportStoryShared(makeRequest({ method: 'web_share' }), 'post-1')

    expect(res.status).toBe(401)
    expect(storiesService.recordStoryShared).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    const limited = NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 })
    vi.mocked(rateLimitMiddleware.generalRateLimit).mockResolvedValue(limited)

    const res = await handleReportStoryShared(makeRequest({ method: 'web_share' }), 'post-1')

    expect(res.status).toBe(429)
  })

  it('returns 400 for an invalid postId', async () => {
    const res = await handleReportStoryShared(makeRequest({ method: 'web_share' }), '')

    expect(res.status).toBe(400)
    expect(storiesService.recordStoryShared).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid method', async () => {
    const res = await handleReportStoryShared(makeRequest({ method: 'carrier_pigeon' }), 'post-1')

    expect(res.status).toBe(400)
    expect(storiesService.recordStoryShared).not.toHaveBeenCalled()
  })

  it('returns 400 when the body is missing/unparseable', async () => {
    const badRequest = { json: vi.fn().mockRejectedValue(new Error('no body')) } as unknown as NextRequest

    const res = await handleReportStoryShared(badRequest, 'post-1')

    expect(res.status).toBe(400)
  })

  it('returns 404 when the story does not exist or is not owned by the requester', async () => {
    vi.mocked(storiesService.recordStoryShared).mockRejectedValue(new NotFoundError('Post'))

    const res = await handleReportStoryShared(makeRequest({ method: 'download' }), 'post-1')

    expect(res.status).toBe(404)
  })

  it('records the share and returns 200 ok on success', async () => {
    vi.mocked(storiesService.recordStoryShared).mockResolvedValue(undefined)

    const res = await handleReportStoryShared(makeRequest({ method: 'web_share' }), 'post-1')
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(storiesService.recordStoryShared).toHaveBeenCalledWith('post-1', 'user-1', 'web_share')
  })
})
