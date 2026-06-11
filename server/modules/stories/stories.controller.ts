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
    const result = await getOrRenderStory(parsed.data.postId, authResult.userId)
    if (result.kind === 'redirect') {
      return NextResponse.redirect(result.url, 302)
    }
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'content-type': result.contentType,
        'cache-control': 'private, no-store, max-age=0',
      },
    })
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
