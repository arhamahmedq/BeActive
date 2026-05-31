import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import {
  isAppError,
  toErrorResponse,
  InternalError,
  NotFoundError,
} from '../../core/errors/AppError'
import { getMyStreak, getPublicStreak } from './streaks.service'

export async function handleGetMyStreak(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const streak = await getMyStreak(auth.userId)
    if (!streak) throw new NotFoundError('Streak')
    return NextResponse.json({ streak }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetPublicStreak(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const streak = await getPublicStreak(userId)
    if (!streak) throw new NotFoundError('Streak')
    return NextResponse.json({ streak }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
