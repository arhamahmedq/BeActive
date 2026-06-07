import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '../../../app/web/lib/supabase/server'
import { requireAuth } from '../../core/middleware/auth'
import { validateQuery } from '../../core/middleware/validate'
import { generalRateLimit } from '../../core/middleware/rateLimit'
import { getSession } from '../auth/auth.service'
import {
  getProfile,
  updateProfile,
  getPublicProfile,
  getUserPostsByUsername,
} from './users.service'
import { updateProfileSchema, profilePostsQuerySchema } from './users.schema'
import {
  toErrorResponse,
  isAppError,
  UnauthorizedError,
  ValidationError,
  InternalError,
} from '../../core/errors/AppError'
import { logger } from '../../core/logger/index'

export async function handleGetMe(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const sessionUser = await getSession(supabase)
    if (!sessionUser) {
      return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
    }

    const profile = await getProfile(sessionUser.id)
    return NextResponse.json({ user: profile })
  } catch (err) {
    logger.error('GET /api/users/me failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
  }
}

export async function handleUpdateMe(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const sessionUser = await getSession(supabase)
    if (!sessionUser) {
      return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
    }

    const body: unknown = await request.json()
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }))
      return NextResponse.json(toErrorResponse(new ValidationError(details)), { status: 400 })
    }

    const updated = await updateProfile(sessionUser.id, parsed.data)
    return NextResponse.json({ user: updated })
  } catch (err) {
    // Surface domain errors with their real status (e.g. 429 from the timezone
    // throttle, 404 for a missing user) instead of masking everything as 401.
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    logger.error('PATCH /api/users/me failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

// --- Public profile (Slice 8A) ---

export async function handleGetPublicProfile(
  request: NextRequest,
  username: string,
): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const rateLimited = await generalRateLimit(request)
  if (rateLimited) return rateLimited

  try {
    const result = await getPublicProfile(auth.userId, username)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('GET /api/users/[username] failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetUserPosts(
  request: NextRequest,
  username: string,
): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const rateLimited = await generalRateLimit(request)
  if (rateLimited) return rateLimited

  const parsed = validateQuery(request.nextUrl.searchParams, profilePostsQuerySchema)
  if (parsed instanceof NextResponse) return parsed

  try {
    const result = await getUserPostsByUsername(auth.userId, username, parsed.cursor, parsed.limit)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('GET /api/users/[username]/posts failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
