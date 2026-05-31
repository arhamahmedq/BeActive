import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { createPostSchema } from '@/server/modules/posts/posts.schema'
import { createPost } from '@/server/modules/posts/posts.service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = postUserRateLimit(auth.userId, 'posts/create')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, createPostSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const post = await createPost(auth.userId, {
      imageKey: bodyOrError.imageKey,
      caption: bodyOrError.caption,
    })
    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
