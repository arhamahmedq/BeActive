import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { uploadUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { signUploadSchema } from '@/server/modules/posts/posts.schema'
import { createSignedUploadUrl } from '@/lib/storage/r2'
import { logger } from '@/server/core/logger/index'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = await uploadUserRateLimit(auth.userId, 'uploads/sign')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, signUploadSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const result = await createSignedUploadUrl(
      auth.userId,
      bodyOrError.mimeType,
      bodyOrError.fileSize,
      bodyOrError.kind === 'avatar' ? 'avatars' : 'posts'
    )
    return NextResponse.json({ uploadUrl: result.uploadUrl, key: result.key }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    Sentry.captureException(err)
    logger.error('uploads/sign: unexpected error', { userId: auth.userId, error: String(err) })
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
