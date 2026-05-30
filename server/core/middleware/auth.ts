import { NextRequest, NextResponse } from 'next/server'
import { UnauthorizedError, toErrorResponse } from '../errors/AppError'

export interface AuthenticatedRequest extends NextRequest {
  userId: string
}

// Stub: validates Supabase session cookie
// Full implementation in Slice 1
export async function requireAuth(
  _request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  // TODO Slice 1: validate Supabase session from HTTP-only cookie
  // Return { userId } on success, NextResponse 401 on failure
  const error = new UnauthorizedError()
  return NextResponse.json(toErrorResponse(error), { status: 401 })
}

// HOF wrapper for protected API route handlers
export function withAuth(
  handler: (request: NextRequest, context: { userId: string }) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await requireAuth(request)
    if (authResult instanceof NextResponse) {
      return authResult
    }
    return handler(request, authResult)
  }
}
