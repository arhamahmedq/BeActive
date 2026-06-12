import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/server/workers/aiClassifier', () => ({
  reprocessStalePendingPosts: vi.fn(),
}))

vi.mock('@/server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

import { GET } from '../../app/web/app/api/cron/reprocess-pending/route'
import { reprocessStalePendingPosts } from '@/server/workers/aiClassifier'

function makeRequest(url: string, authHeader?: string): NextRequest {
  return {
    url,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader ?? null : null),
    },
  } as unknown as NextRequest
}

describe('GET /api/cron/reprocess-pending', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    vi.clearAllMocks()
  })

  afterAll(() => {
    process.env.CRON_SECRET = ORIGINAL_SECRET
  })

  it('returns 401 when the Authorization header is missing', async () => {
    const res = await GET(makeRequest('http://localhost/api/cron/reprocess-pending'))
    expect(res.status).toBe(401)
    expect(reprocessStalePendingPosts).not.toHaveBeenCalled()
  })

  it('returns 401 when the Authorization header does not match CRON_SECRET', async () => {
    const res = await GET(makeRequest('http://localhost/api/cron/reprocess-pending', 'Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 200 with the reconciler result when authorized and nothing is stuck', async () => {
    vi.mocked(reprocessStalePendingPosts).mockResolvedValue({ found: 0, succeeded: 0, failed: 0 })
    const res = await GET(makeRequest('http://localhost/api/cron/reprocess-pending', 'Bearer test-secret'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, found: 0, succeeded: 0, failed: 0 })
  })

  it('reports stale posts that were found and reprocessed', async () => {
    vi.mocked(reprocessStalePendingPosts).mockResolvedValue({ found: 2, succeeded: 2, failed: 0 })
    const res = await GET(makeRequest('http://localhost/api/cron/reprocess-pending', 'Bearer test-secret'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, found: 2, succeeded: 2, failed: 0 })
  })

  it('passes ?limit= and ?maxAgeMinutes= through as limit/thresholdMs', async () => {
    vi.mocked(reprocessStalePendingPosts).mockResolvedValue({ found: 1, succeeded: 1, failed: 0 })
    await GET(
      makeRequest('http://localhost/api/cron/reprocess-pending?limit=5&maxAgeMinutes=0', 'Bearer test-secret')
    )
    expect(reprocessStalePendingPosts).toHaveBeenCalledWith(expect.any(Date), { limit: 5, thresholdMs: 0 })
  })

  it('returns 500 if the reconciler throws', async () => {
    vi.mocked(reprocessStalePendingPosts).mockRejectedValue(new Error('db unreachable'))
    const res = await GET(makeRequest('http://localhost/api/cron/reprocess-pending', 'Bearer test-secret'))
    expect(res.status).toBe(500)
  })
})
