import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { signupSchema } from '@/server/modules/auth/auth.schema'
import * as authService from '@/server/modules/auth/auth.service'
import { validateBody } from '@/server/core/middleware/validate'
import { createRateLimiter } from '@/server/core/middleware/rateLimit'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'

// Rate limit: 3 per minute per IP (per security.md)
const signupRateLimit = createRateLimiter({ maxRequests: 3, windowMs: 60_000 })

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await signupRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const bodyOrError = await validateBody(request, signupSchema)
  if (bodyOrError instanceof NextResponse) return bodyOrError

  try {
    const supabase = await createClient()
    const result = await authService.signup(supabase, bodyOrError)

    const isResent = result.status === 'VERIFICATION_RESENT'
    return NextResponse.json(
      {
        status: result.status,
        message: isResent
          ? 'Confirmation email resent. Check your inbox.'
          : 'Check your email to confirm your account.',
      },
      { status: isResent ? 200 : 201 }
    )
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
