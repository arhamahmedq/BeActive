import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { validateBody, validateQuery } from '../../core/middleware/validate'
import { likeUserRateLimit, commentUserRateLimit, generalRateLimit } from '../../core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '../../core/errors/AppError'
import { logger } from '../../core/logger/index'
import { createCommentSchema, commentsQuerySchema } from './interactions.schema'
import { likePost, unlikePost, addComment, getComments, deleteComment } from './interactions.service'

export async function handleLikePost(request: NextRequest, postId: string): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const limited = likeUserRateLimit(auth.userId, 'posts/like')
  if (limited) return limited

  try {
    return NextResponse.json(await likePost(auth.userId, postId), { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('POST /api/posts/[id]/like failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleUnlikePost(request: NextRequest, postId: string): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const limited = likeUserRateLimit(auth.userId, 'posts/unlike')
  if (limited) return limited

  try {
    return NextResponse.json(await unlikePost(auth.userId, postId), { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('DELETE /api/posts/[id]/like failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleCreateComment(request: NextRequest, postId: string): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const limited = commentUserRateLimit(auth.userId, 'posts/comment')
  if (limited) return limited

  const body = await validateBody(request, createCommentSchema)
  if (body instanceof NextResponse) return body

  try {
    const comment = await addComment(auth.userId, postId, body.body)
    return NextResponse.json({ comment }, { status: 201 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('POST /api/posts/[id]/comments failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleDeleteComment(
  request: NextRequest,
  postId: string,
  commentId: string,
): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const limited = commentUserRateLimit(auth.userId, 'posts/comment/delete')
  if (limited) return limited

  try {
    await deleteComment(auth.userId, postId, commentId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('DELETE /api/posts/[id]/comments/[commentId] failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}

export async function handleGetComments(request: NextRequest, postId: string): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const limited = generalRateLimit(request)
  if (limited) return limited

  const query = validateQuery(request.nextUrl.searchParams, commentsQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const result = await getComments(auth.userId, postId, query.cursor, query.limit)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    logger.error('GET /api/posts/[id]/comments failed', { error: String(err) })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
