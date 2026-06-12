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
//
// One Ratelimit instance per distinct (maxRequests, windowMs) config — each
// instance is created with its own slidingWindow(maxRequests, window), so the
// configured per-endpoint limit is the limit actually enforced (previously a
// single shared instance hardcoded to 100/min was used for every config).
// ---------------------------------------------------------------------------

type Ratelimit = import('@upstash/ratelimit').Ratelimit
type Redis = import('@upstash/redis').Redis
type Duration = `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`

let _redis: Redis | null | undefined
const _limiterCache = new Map<string, Ratelimit>()

function msToUpstashDuration(windowMs: number): Duration {
  if (windowMs % 3_600_000 === 0) return `${windowMs / 3_600_000} h`
  if (windowMs % 60_000 === 0) return `${windowMs / 60_000} m`
  if (windowMs % 1_000 === 0) return `${windowMs / 1_000} s`
  return `${windowMs} ms`
}

async function getRedis(): Promise<Redis | null> {
  if (_redis !== undefined) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    _redis = null
    return _redis
  }

  try {
    const { Redis: RedisCtor } = await import('@upstash/redis')
    _redis = new RedisCtor({ url, token })
  } catch (err) {
    logger.error('Failed to initialise Upstash Redis client — falling back to in-memory', { error: String(err) })
    _redis = null
  }
  return _redis
}

async function getLimiterForConfig(config: RateLimitConfig): Promise<Ratelimit | null> {
  const cacheKey = `${config.maxRequests}:${config.windowMs}`
  const cached = _limiterCache.get(cacheKey)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) return null

  try {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.maxRequests, msToUpstashDuration(config.windowMs)),
      prefix: `beactive:rl:${cacheKey}`,
      analytics: false,
    })
    _limiterCache.set(cacheKey, limiter)
    return limiter
  } catch (err) {
    logger.error('Failed to initialise Upstash rate limiter — falling back to in-memory', {
      error: String(err),
      config: cacheKey,
    })
    return null
  }
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / CI — non-functional across multiple
// Vercel serverless instances, but still correct within a single process).
// Capped and lazily swept to avoid an unbounded Map.
// ---------------------------------------------------------------------------

const _memStore = new Map<string, { count: number; resetAt: number }>()
const MEM_STORE_MAX_SIZE = 10_000

function sweepMemStore(now: number): void {
  if (_memStore.size <= MEM_STORE_MAX_SIZE) return
  for (const [k, v] of _memStore) {
    if (v.resetAt < now) _memStore.delete(k)
  }
}

function memCheck(key: string, maxRequests: number, windowMs: number): NextResponse | null {
  const now = Date.now()
  sweepMemStore(now)
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

interface UpstashCheckResult {
  // true once Upstash has answered (allow or deny) — caller must NOT also run
  // memCheck in this case, or every allowed request would be double-counted.
  handled: boolean
  response: NextResponse | null
}

async function upstashCheck(key: string, config: RateLimitConfig): Promise<UpstashCheckResult> {
  const limiter = await getLimiterForConfig(config)
  if (!limiter) return { handled: false, response: null }

  try {
    const { success } = await limiter.limit(key)
    if (!success) {
      const endpoint = key.split(':').slice(2).join(':')
      logger.warn('Rate limit exceeded (Upstash)', {
        endpoint,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
      })
      return { handled: true, response: NextResponse.json(toErrorResponse(new RateLimitError()), { status: 429 }) }
    }
    return { handled: true, response: null }
  } catch (err) {
    // Upstash unavailable — fail open (don't block users on Redis outage) and
    // fall back to the in-memory check for this request.
    logger.error('Upstash rate limit check failed — failing open', { error: String(err) })
    return { handled: false, response: null }
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

    const { handled, response } = await upstashCheck(key, config)
    if (handled) return response
    return memCheck(key, config.maxRequests, config.windowMs)
  }
}

export function createUserRateLimiter(config: RateLimitConfig) {
  return async function checkUserRateLimit(
    userId: string,
    endpoint: string
  ): Promise<NextResponse | null> {
    const key = `user:${userId}:${endpoint}`

    const { handled, response } = await upstashCheck(key, config)
    if (handled) return response
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
