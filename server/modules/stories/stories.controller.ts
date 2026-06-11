// Stories controller — thin route handler, delegates to service.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { generalRateLimit } from '../../core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError, ValidationError } from '../../core/errors/AppError'
import { storyParamsSchema } from './stories.schema'
import { getOrRenderStory } from './stories.service'

export async function handleGetStory(request: NextRequest, postIdParam: string): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const limited = await generalRateLimit(request)
  if (limited) return limited

  const parsed = storyParamsSchema.safeParse({ postId: postIdParam })
  if (!parsed.success) {
    const err = new ValidationError(parsed.error.issues)
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  try {
    const { buffer, contentType } = await getOrRenderStory(parsed.data.postId, authResult.userId)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': contentType,
        // Card is immutable per shareVersion but auth-gated, so private. Lets a
        // repeat tap reuse the browser cache instead of re-hitting the function.
        'cache-control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
