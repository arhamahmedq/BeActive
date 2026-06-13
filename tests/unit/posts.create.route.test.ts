import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

vi.mock('@/server/core/middleware/auth', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/server/core/middleware/rateLimit', () => ({
  postUserRateLimit: vi.fn(),
}))

vi.mock('@/server/core/middleware/validate', () => ({
  validateBody: vi.fn(),
}))

vi.mock('@/server/modules/posts/posts.service', () => ({
  createPost: vi.fn(),
}))

vi.mock('@/server/core/queue/qstash', () => ({
  enqueueClassificationJob: vi.fn(),
}))

vi.mock('@/server/workers/aiClassifier', () => ({
  processUploadedPost: vi.fn(),
}))

vi.mock('@/server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

// after() runs its callback immediately so fallback-classification assertions
// don't need to wait for the real post-response scheduling behavior.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => cb()),
  }
})

import { POST } from '../../app/web/app/api/posts/create/route'
import { requireAuth } from '@/server/core/middleware/auth'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { validateBody } from '@/server/core/middleware/validate'
import { createPost } from '@/server/modules/posts/posts.service'
import { enqueueClassificationJob } from '@/server/core/queue/qstash'
import { processUploadedPost } from '@/server/workers/aiClassifier'
import { logger } from '@/server/core/logger/index'
import * as Sentry from '@sentry/nextjs'

const POST_RESPONSE = {
  id: 'post-1',
  imageUrl: 'https://r2.example.com/posts/user-1/post-1.jpg',
  imageKey: 'posts/user-1/post-1.jpg',
  caption: null,
  status: 'PENDING',
  createdAt: new Date('2026-06-12T00:00:00Z'),
}

function makeRequest(): NextRequest {
  return {} as unknown as NextRequest
}

describe('POST /api/posts/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(postUserRateLimit).mockResolvedValue(null)
    vi.mocked(validateBody).mockResolvedValue({ imageKey: 'posts/user-1/post-1.jpg', caption: undefined })
  })

  it('enqueues a classification job with the created post payload and returns 201', async () => {
    vi.mocked(createPost).mockResolvedValue(POST_RESPONSE)
    vi.mocked(enqueueClassificationJob).mockResolvedValue(true)

    const res = await POST(makeRequest())

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ post: JSON.parse(JSON.stringify(POST_RESPONSE)) })
    expect(enqueueClassificationJob).toHaveBeenCalledWith({
      postId: 'post-1',
      imageUrl: POST_RESPONSE.imageUrl,
      userId: 'user-1',
      correlationId: 'post-1',
    })
  })

  it('still returns 201, logs, and falls back to inline classification when enqueue fails', async () => {
    vi.mocked(createPost).mockResolvedValue(POST_RESPONSE)
    vi.mocked(enqueueClassificationJob).mockResolvedValue(false)
    vi.mocked(processUploadedPost).mockResolvedValue(undefined)

    const res = await POST(makeRequest())

    expect(res.status).toBe(201)
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to enqueue classification job — falling back to inline classification',
      { postId: 'post-1' }
    )
    expect(processUploadedPost).toHaveBeenCalledWith({
      postId: 'post-1',
      imageUrl: POST_RESPONSE.imageUrl,
      userId: 'user-1',
      correlationId: 'post-1',
    })
  })

  it('logs but does not fail the request when the fallback classification itself throws', async () => {
    vi.mocked(createPost).mockResolvedValue(POST_RESPONSE)
    vi.mocked(enqueueClassificationJob).mockResolvedValue(false)
    vi.mocked(processUploadedPost).mockRejectedValue(new Error('classification boom'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(201)
    expect(logger.error).toHaveBeenCalledWith('Fallback inline classification failed', {
      postId: 'post-1',
      error: expect.stringContaining('classification boom'),
    })
  })

  it('does not run the fallback when enqueue succeeds', async () => {
    vi.mocked(createPost).mockResolvedValue(POST_RESPONSE)
    vi.mocked(enqueueClassificationJob).mockResolvedValue(true)

    const res = await POST(makeRequest())

    expect(res.status).toBe(201)
    expect(processUploadedPost).not.toHaveBeenCalled()
  })

  it('returns the auth response when requireAuth fails', async () => {
    const unauthorized = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    vi.mocked(requireAuth).mockResolvedValue(unauthorized)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(createPost).not.toHaveBeenCalled()
    expect(enqueueClassificationJob).not.toHaveBeenCalled()
  })

  it('returns 500 INTERNAL_ERROR and reports to Sentry on an unexpected error', async () => {
    vi.mocked(createPost).mockRejectedValue(new Error('db connection lost'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'db connection lost' }))
    expect(logger.error).toHaveBeenCalledWith('posts/create: unexpected error', {
      userId: 'user-1',
      error: expect.stringContaining('db connection lost'),
    })
  })
})
