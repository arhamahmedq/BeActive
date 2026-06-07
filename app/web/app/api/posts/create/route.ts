import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { createPostSchema } from '@/server/modules/posts/posts.schema'
import { createPost } from '@/server/modules/posts/posts.service'
import { processUploadedPost } from '@/server/workers/aiClassifier'
import { logger } from '@/server/core/logger/index'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = await postUserRateLimit(auth.userId, 'posts/create')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, createPostSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const post = await createPost(auth.userId, {
      imageKey: bodyOrError.imageKey,
      caption: bodyOrError.caption,
    })

    // Trigger AI classification after the 201 response is flushed to the client.
    // after() runs within the same function invocation but post-response — this
    // satisfies the async classification requirement without blocking upload UX.
    after(async () => {
      try {
        await processUploadedPost({
          postId: post.id,
          imageUrl: post.imageUrl,
          userId: auth.userId,
          correlationId: post.id,
        })
      } catch (err) {
        logger.error('AI classification after() handler threw unexpectedly', {
          postId: post.id,
          error: String(err),
        })
      }
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
