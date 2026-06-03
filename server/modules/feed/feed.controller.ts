import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { validateQuery } from '../../core/middleware/validate'
import { isAppError, toErrorResponse, InternalError } from '../../core/errors/AppError'
import { getFeed } from './feed.service'
import { feedQuerySchema } from './feed.schema'

export async function handleGetFeed(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const query = validateQuery(request.nextUrl.searchParams, feedQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const feed = await getFeed(auth.userId, query)
    return NextResponse.json(feed, { status: 200 })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    return NextResponse.json(toErrorResponse(new InternalError()), { status: 500 })
  }
}
