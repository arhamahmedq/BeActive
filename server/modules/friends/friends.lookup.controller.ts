import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { isAppError, toErrorResponse, InternalError, NotFoundError } from '../../core/errors/AppError'
import { findFriendshipId } from './friends.lookup.service'

// GET /api/friends/lookup?userId=X
// Returns { friendshipId } if an accepted friendship exists between the caller and X.
// Used by the frontend remove action — GET /api/friends does not expose friendshipId.
export async function handleLookupFriendship(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const otherUserId = request.nextUrl.searchParams.get('userId')
  if (!otherUserId || otherUserId.trim() === '') {
    return NextResponse.json(
      toErrorResponse({ code: 'VALIDATION_ERROR', message: 'userId query param is required', statusCode: 400 } as never),
      { status: 400 }
    )
  }

  try {
    const friendshipId = await findFriendshipId(auth.userId, otherUserId)
    if (!friendshipId) throw new NotFoundError('Friendship')
    return NextResponse.json({ friendshipId }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
