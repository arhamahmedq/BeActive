import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { createPostSchema } from '@/server/modules/posts/posts.schema'
import { createPost } from '@/server/modules/posts/posts.service'
import { enqueueClassificationJob } from '@/server/core/queue/qstash'
import { logger } from '@/server/core/logger/index'

export const runtime = 'nodejs'

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

    // Enqueue AI classification via QStash instead of running it inline.
    // QStash POSTs this payload to /api/queue/classify, which calls
    // processUploadedPost — identical body to the old after() handler. If the
    // publish itself fails (network, misconfiguration), the post stays
    // PENDING and the reprocess-pending reconciler picks it up.
    const enqueued = await enqueueClassificationJob({
      postId: post.id,
      imageUrl: post.imageUrl,
      userId: auth.userId,
      correlationId: post.id,
    })
    if (!enqueued) {
      logger.error('Failed to enqueue classification job — post left PENDING for reconciler', {
        postId: post.id,
      })
    }

    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
