import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/core/middleware/auth'
import { validateBody } from '@/server/core/middleware/validate'
import { uploadUserRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'
import { signUploadSchema } from '@/server/modules/posts/posts.schema'
import { createSignedUploadUrl } from '@/lib/storage/r2'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const rateLimitResponse = uploadUserRateLimit(auth.userId, 'uploads/sign')
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, signUploadSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const result = await createSignedUploadUrl(
      auth.userId,
      bodyOrError.mimeType,
      bodyOrError.fileSize
    )
    return NextResponse.json({ uploadUrl: result.uploadUrl, key: result.key }, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
