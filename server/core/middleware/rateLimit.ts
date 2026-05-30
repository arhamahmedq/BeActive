import { NextRequest, NextResponse } from 'next/server'
import { RateLimitError, toErrorResponse } from '../errors/AppError'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

// In-memory store for MVP — replace with Redis at scale
const requestCounts = new Map<string, { count: number; resetAt: number }>()

export function createRateLimiter(config: RateLimitConfig) {
  return function checkRateLimit(request: NextRequest): NextResponse | null {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const key = `${ip}:${request.nextUrl.pathname}`
    const now = Date.now()

    const record = requestCounts.get(key)
    if (!record || record.resetAt < now) {
      requestCounts.set(key, { count: 1, resetAt: now + config.windowMs })
      return null
    }

    record.count++
    if (record.count > config.maxRequests) {
      const error = new RateLimitError()
      return NextResponse.json(toErrorResponse(error), { status: 429 })
    }

    return null
  }
}

// Pre-configured rate limiters per CLAUDE.md §9
export const authRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 })
export const uploadRateLimit = createRateLimiter({ maxRequests: 10, windowMs: 3_600_000 })
export const generalRateLimit = createRateLimiter({ maxRequests: 100, windowMs: 60_000 })
