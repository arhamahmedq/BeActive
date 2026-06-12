import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// Hoisted mocks referenced by closure inside the @upstash/ratelimit factory —
// stable across vi.resetModules() so call-count assertions survive re-imports.
const limitMock = vi.fn()
const slidingWindowMock = vi.fn((maxRequests: number, window: string) => ({ maxRequests, window }))

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    constructor(_opts: unknown) {}
  },
}))

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow = slidingWindowMock
    limit = limitMock
    constructor(_config: unknown) {}
  }
  return { Ratelimit }
})

vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function makeIpRequest(ip: string, pathname: string): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'x-forwarded-for' ? ip : null) },
    nextUrl: { pathname },
  } as unknown as NextRequest
}

const ORIGINAL_URL = process.env.UPSTASH_REDIS_REST_URL
const ORIGINAL_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

describe('rate limiting middleware', () => {
  beforeEach(() => {
    vi.resetModules()
    limitMock.mockReset()
    slidingWindowMock.mockClear()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_URL
    if (ORIGINAL_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_TOKEN
  })

  describe('in-memory fallback (Upstash not configured)', () => {
    it('allows requests under the limit and returns RATE_LIMITED once exceeded', async () => {
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 })
      const req = makeIpRequest('1.2.3.4', '/api/test-mem')

      expect(await limiter(req)).toBeNull()
      expect(await limiter(req)).toBeNull()

      const blocked = await limiter(req)
      expect(blocked).not.toBeNull()
      expect(blocked!.status).toBe(429)
      await expect(blocked!.json()).resolves.toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      })
    })

    it('never touches the Upstash limiter when Upstash env vars are unset', async () => {
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
      await limiter(makeIpRequest('5.5.5.5', '/api/test-mem-2'))
      expect(limitMock).not.toHaveBeenCalled()
    })
  })

  describe('Upstash backend (configured)', () => {
    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    })

    it('creates one Ratelimit instance per distinct (maxRequests, windowMs) config', async () => {
      limitMock.mockResolvedValue({ success: true })
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')

      const fiveAMinute = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
      const threeAnHour = createRateLimiter({ maxRequests: 3, windowMs: 3_600_000 })

      await fiveAMinute(makeIpRequest('1.1.1.1', '/api/a'))
      await threeAnHour(makeIpRequest('1.1.1.1', '/api/b'))
      // Same config as fiveAMinute, different key — must reuse the cached instance.
      await fiveAMinute(makeIpRequest('2.2.2.2', '/api/a'))

      expect(slidingWindowMock).toHaveBeenCalledTimes(2)
      expect(slidingWindowMock).toHaveBeenCalledWith(5, '1 m')
      expect(slidingWindowMock).toHaveBeenCalledWith(3, '1 h')
    })

    it('formats sub-minute windows in seconds', async () => {
      limitMock.mockResolvedValue({ success: true })
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')
      const limiter = createRateLimiter({ maxRequests: 10, windowMs: 15_000 })
      await limiter(makeIpRequest('6.6.6.6', '/api/seconds'))
      expect(slidingWindowMock).toHaveBeenCalledWith(10, '15 s')
    })

    it('returns 429 with the RATE_LIMITED shape when Upstash denies', async () => {
      limitMock.mockResolvedValue({ success: false })
      const { createUserRateLimiter } = await import('@/server/core/middleware/rateLimit')
      const limiter = createUserRateLimiter({ maxRequests: 5, windowMs: 60_000 })

      const res = await limiter('user-1', 'posts/create')
      expect(res).not.toBeNull()
      expect(res!.status).toBe(429)
      await expect(res!.json()).resolves.toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      })
    })

    it('does not double-count via the in-memory store once Upstash has answered', async () => {
      limitMock.mockResolvedValue({ success: true })
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')
      // maxRequests=1: if the in-memory check also ran alongside Upstash, the
      // 2nd call would 429. It must not, because Upstash already allowed it.
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 })
      const req = makeIpRequest('3.3.3.3', '/api/double-count')

      expect(await limiter(req)).toBeNull()
      expect(await limiter(req)).toBeNull()
      expect(await limiter(req)).toBeNull()
    })

    it('fails open and falls back to in-memory when Upstash throws', async () => {
      limitMock.mockRejectedValue(new Error('upstash unreachable'))
      const { createRateLimiter } = await import('@/server/core/middleware/rateLimit')
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 })
      const req = makeIpRequest('4.4.4.4', '/api/fail-open')

      expect(await limiter(req)).toBeNull()
      const second = await limiter(req)
      expect(second).not.toBeNull()
      expect(second!.status).toBe(429)
    })
  })
})
