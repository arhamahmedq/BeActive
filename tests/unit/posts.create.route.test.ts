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

vi.mock('@/server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { POST } from '../../app/web/app/api/posts/create/route'
import { requireAuth } from '@/server/core/middleware/auth'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { validateBody } from '@/server/core/middleware/validate'
import { createPost } from '@/server/modules/posts/posts.service'
import { enqueueClassificationJob } from '@/server/core/queue/qstash'
import { logger } from '@/server/core/logger/index'

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

  it('still returns 201 and logs an error when enqueue fails', async () => {
    vi.mocked(createPost).mockResolvedValue(POST_RESPONSE)
    vi.mocked(enqueueClassificationJob).mockResolvedValue(false)

    const res = await POST(makeRequest())

    expect(res.status).toBe(201)
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to enqueue classification job — post left PENDING for reconciler',
      { postId: 'post-1' }
    )
  })

  it('returns the auth response when requireAuth fails', async () => {
    const unauthorized = NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    vi.mocked(requireAuth).mockResolvedValue(unauthorized)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(createPost).not.toHaveBeenCalled()
    expect(enqueueClassificationJob).not.toHaveBeenCalled()
  })
})
