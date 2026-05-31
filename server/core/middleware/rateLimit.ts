import { NextResponse } from 'next/server'
import { RateLimitError, toErrorResponse } from '../errors/AppError'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

// In-memory store: effective for single-process dev, ineffective on Vercel serverless
// (each invocation is a fresh process). Replace with Redis/Upstash before launch.
const requestCounts = new Map<string, { count: number; resetAt: number }>()

function buildRateLimitResponse(): NextResponse {
  const error = new RateLimitError()
  return NextResponse.json(toErrorResponse(error), { status: 429 })
}

function checkKey(key: string, maxRequests: number, windowMs: number): NextResponse | null {
  const now = Date.now()
  const record = requestCounts.get(key)

  if (!record || record.resetAt < now) {
    requestCounts.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  record.count++
  if (record.count > maxRequests) {
    return buildRateLimitResponse()
  }
  return null
}

export function createRateLimiter(config: RateLimitConfig) {
  return function checkRateLimit(request: { headers: { get(name: string): string | null }; nextUrl: { pathname: string } }): NextResponse | null {
    const ip =
      request.headers.get('x-real-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'
    const key = `ip:${ip}:${request.nextUrl.pathname}`
    return checkKey(key, config.maxRequests, config.windowMs)
  }
}

export function createUserRateLimiter(config: RateLimitConfig) {
  return function checkUserRateLimit(userId: string, endpoint: string): NextResponse | null {
    const key = `user:${userId}:${endpoint}`
    return checkKey(key, config.maxRequests, config.windowMs)
  }
}

// Pre-configured rate limiters per CLAUDE.md §9
export const authRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
export const uploadRateLimit = createRateLimiter({ maxRequests: 10, windowMs: 3_600_000 })
export const generalRateLimit = createRateLimiter({ maxRequests: 100, windowMs: 60_000 })

// User-scoped limiters for authenticated endpoints (per API_CONTRACTS.md)
export const uploadUserRateLimit = createUserRateLimiter({ maxRequests: 10, windowMs: 3_600_000 })
export const postUserRateLimit = createUserRateLimiter({ maxRequests: 5, windowMs: 3_600_000 })
