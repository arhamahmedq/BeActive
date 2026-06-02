import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '../../../app/web/lib/supabase/server'
import { getSession } from '../auth/auth.service'
import { getProfile, updateProfile } from './users.service'
import { updateProfileSchema } from './users.schema'
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
