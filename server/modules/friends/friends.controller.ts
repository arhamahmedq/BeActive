import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { validateBody, validateQuery } from '../../core/middleware/validate'
import {
  friendRequestBurstLimit,
  friendRequestUserRateLimit,
  friendActionUserRateLimit,
  userSearchRateLimit,
} from '../../core/middleware/rateLimit'
import { logger } from '../../core/logger/index'
import { isAppError, toErrorResponse, InternalError } from '../../core/errors/AppError'
import {
  requestFriendSchema,
  acceptFriendSchema,
  rejectFriendSchema,
  removeFriendSchema,
  blockUserSchema,
  searchUsersSchema,
} from './friends.schema'
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  blockUser,
  getFriends,
  getPendingFriendships,
  searchUsers,
} from './friends.service'

export async function handleSendFriendRequest(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  // Burst cap first (5/min): rejects automation that fires all 20 hourly slots in <1s.
  const burstResponse = friendRequestBurstLimit(auth.userId, 'friends/request:burst')
  if (burstResponse) return burstResponse

  // Hourly cap (20/hr): limits total request volume including request→cancel loops.
  const hourlyResponse = friendRequestUserRateLimit(auth.userId, 'friends/request:hourly')
  if (hourlyResponse) return hourlyResponse

  const bodyOrError = await validateBody(request, requestFriendSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const result = await sendFriendRequest(auth.userId, bodyOrError.targetUserId)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleAcceptFriendRequest(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = friendActionUserRateLimit(auth.userId, 'friends/accept')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, acceptFriendSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const result = await acceptFriendRequest(auth.userId, bodyOrError.friendshipId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleRemoveFriend(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = friendActionUserRateLimit(auth.userId, 'friends/remove')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, removeFriendSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    await removeFriend(auth.userId, bodyOrError.friendshipId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleBlockUser(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = friendActionUserRateLimit(auth.userId, 'friends/block')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, blockUserSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const result = await blockUser(auth.userId, bodyOrError.targetUserId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetFriends(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const result = await getFriends(auth.userId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleRejectFriendRequest(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = friendActionUserRateLimit(auth.userId, 'friends/reject')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, rejectFriendSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    await rejectFriendRequest(auth.userId, bodyOrError.friendshipId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetPendingFriendships(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const result = await getPendingFriendships(auth.userId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleSearchUsers(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = userSearchRateLimit(auth.userId, 'users/search')
  if (rateLimitResponse) {
    logger.warn('Search rate limit exceeded', { endpoint: 'users/search' })
    return rateLimitResponse
  }

  const queryOrError = validateQuery(request.nextUrl.searchParams, searchUsersSchema)
  if (queryOrError instanceof NextResponse) return queryOrError

  try {
    const result = await searchUsers(queryOrError.q, auth.userId)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
