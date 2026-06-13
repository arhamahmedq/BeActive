import { NextRequest, NextResponse, after } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { postUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { createPostSchema } from '@/server/modules/posts/posts.schema'
import { createPost } from '@/server/modules/posts/posts.service'
import { enqueueClassificationJob } from '@/server/core/queue/qstash'
import { processUploadedPost } from '@/server/workers/aiClassifier'
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
    // publish itself fails (e.g. QSTASH_TOKEN/NEXT_PUBLIC_APP_URL unset, or a
    // network error), fall back to running classification directly via
    // after() so the post doesn't sit PENDING until the reconciler cron runs.
    // processUploadedPost's PENDING idempotency guard makes this safe even if
    // a delayed QStash delivery also arrives later.
    const jobPayload = {
      postId: post.id,
      imageUrl: post.imageUrl,
      userId: auth.userId,
      correlationId: post.id,
    }
    const enqueued = await enqueueClassificationJob(jobPayload)
    if (!enqueued) {
      logger.error('Failed to enqueue classification job — falling back to inline classification', {
        postId: post.id,
      })
      after(() =>
        processUploadedPost(jobPayload).catch((e: unknown) => {
          logger.error('Fallback inline classification failed', {
            postId: post.id,
            error: String(e),
          })
        })
      )
    }

    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    Sentry.captureException(err)
    logger.error('posts/create: unexpected error', { userId: auth.userId, error: String(err) })
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
