import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/server/modules/auth/auth.schema'
import * as authService from '@/server/modules/auth/auth.service'
import { validateBody } from '@/server/core/middleware/validate'
import { authRateLimit } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'

// Rate limit: 5 per minute per IP (per security.md) — uses pre-configured authRateLimit
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = authRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, loginSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const supabase = await createClient()
    const result = await authService.login(supabase, bodyOrError)
    return NextResponse.json(
      { user: result.user, session: result.session },
      { status: 200 }
    )
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
