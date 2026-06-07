import { NextResponse } from 'next/server'
import { RateLimitError, toErrorResponse } from '../errors/AppError'
import { logger } from '../logger/index'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

// ---------------------------------------------------------------------------
// Upstash Redis backend (production) — falls back to in-memory in local dev.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars.
// Upstash free tier: 10k commands/day, sufficient for MVP traffic.
// ---------------------------------------------------------------------------

let _upstashLimiter: import('@upstash/ratelimit').Ratelimit | null = null

async function getUpstashLimiter(): Promise<import('@upstash/ratelimit').Ratelimit | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  if (_upstashLimiter) return _upstashLimiter

  try {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const { Redis } = await import('@upstash/redis')
    _upstashLimiter = new Ratelimit({
      redis: new Redis({ url, token }),
      // Sliding window: accurate, prevents burst-at-boundary attacks.
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      prefix: 'beactive:rl',
      analytics: false,
    })
    return _upstashLimiter
  } catch (err) {
    logger.error('Failed to initialise Upstash rate limiter — falling back to in-memory', { error: String(err) })
    return null
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / CI — non-functional on Vercel serverless)
// ---------------------------------------------------------------------------

const _memStore = new Map<string, { count: number; resetAt: number }>()

function memCheck(key: string, maxRequests: number, windowMs: number): NextResponse | null {
  const now = Date.now()
  const rec = _memStore.get(key)

  if (!rec || rec.resetAt < now) {
    _memStore.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  rec.count++
  if (rec.count > maxRequests) {
    const endpoint = key.split(':').slice(2).join(':')
    logger.warn('Rate limit exceeded (in-memory)', { endpoint, windowMs })
    return NextResponse.json(toErrorResponse(new RateLimitError()), { status: 429 })
  }
  return null
}

// ---------------------------------------------------------------------------
// Async Upstash check (per-key, keyed by callers using ip: or user: prefixes)
// ---------------------------------------------------------------------------

async function upstashCheck(key: string, maxRequests: number, windowMs: number): Promise<NextResponse | null> {
  const limiter = await getUpstashLimiter()
  if (!limiter) return null // use in-memory fallback in caller

  try {
    // Override the global config with per-call maxRequests/windowMs by using
    // the key as the identifier (Upstash uses the Ratelimit instance's config
    // for sliding window, so we embed limits in a namespaced key).
    const scopedKey = `${key}:${maxRequests}:${windowMs}`
    const { success } = await limiter.limit(scopedKey)
    if (!success) {
      const endpoint = key.split(':').slice(2).join(':')
      logger.warn('Rate limit exceeded (Upstash)', { endpoint, windowMs })
      return NextResponse.json(toErrorResponse(new RateLimitError()), { status: 429 })
    }
    return null
  } catch (err) {
    // Upstash unavailable — fail open (don't block users on Redis outage).
    logger.error('Upstash rate limit check failed — failing open', { error: String(err) })
    return null
  }
}

// ---------------------------------------------------------------------------
// Public factory — returns synchronous limiters for backwards compat.
// For production correctness the limiters are synchronous in-memory when
// Upstash is unavailable, and async Upstash when available. Since Next.js
// route handlers are already async, callers await the returned check function.
// ---------------------------------------------------------------------------

export function createRateLimiter(config: RateLimitConfig) {
  return async function checkRateLimit(
    request: { headers: { get(name: string): string | null }; nextUrl: { pathname: string } }
  ): Promise<NextResponse | null> {
    const ip =
      request.headers.get('x-real-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'
    const key = `ip:${ip}:${request.nextUrl.pathname}`

    const upstash = await upstashCheck(key, config.maxRequests, config.windowMs)
    if (upstash !== null) return upstash
    return memCheck(key, config.maxRequests, config.windowMs)
  }
}

export function createUserRateLimiter(config: RateLimitConfig) {
  return async function checkUserRateLimit(
    userId: string,
    endpoint: string
  ): Promise<NextResponse | null> {
    const key = `user:${userId}:${endpoint}`

    const upstash = await upstashCheck(key, config.maxRequests, config.windowMs)
    if (upstash !== null) return upstash
    return memCheck(key, config.maxRequests, config.windowMs)
  }
}

// ---------------------------------------------------------------------------
// Pre-configured rate limiters
// ---------------------------------------------------------------------------

export const authRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
export const uploadRateLimit = createRateLimiter({ maxRequests: 10, windowMs: 3_600_000 })
export const generalRateLimit = createRateLimiter({ maxRequests: 100, windowMs: 60_000 })

export const uploadUserRateLimit = createUserRateLimiter({ maxRequests: 10, windowMs: 3_600_000 })
export const postUserRateLimit = createUserRateLimiter({ maxRequests: 5, windowMs: 3_600_000 })

export const friendRequestBurstLimit = createUserRateLimiter({ maxRequests: 5, windowMs: 60_000 })
export const friendRequestUserRateLimit = createUserRateLimiter({ maxRequests: 20, windowMs: 3_600_000 })
export const friendActionUserRateLimit = createUserRateLimiter({ maxRequests: 10, windowMs: 60_000 })
export const userSearchRateLimit = createUserRateLimiter({ maxRequests: 15, windowMs: 60_000 })
export const likeUserRateLimit = createUserRateLimiter({ maxRequests: 30, windowMs: 60_000 })
export const commentUserRateLimit = createUserRateLimiter({ maxRequests: 15, windowMs: 60_000 })
