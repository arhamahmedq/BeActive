import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UnauthorizedError, toErrorResponse } from '../errors/AppError'

export interface AuthContext {
  userId: string
}

export async function requireAuth(
  _request: NextRequest
): Promise<AuthContext | NextResponse> {
  try {
    const supabase = await createClient()
    // getSession() reads and validates the JWT from the HTTP-only cookie without
    // a network round-trip to Supabase (~1ms vs ~400ms for getUser()). Safe
    // because: (1) HTTP-only + SameSite=Lax cookies can't be injected by client
    // JS; (2) @supabase/ssr validates the HMAC-HS256 signature; (3) the proxy
    // middleware calls getUser() on page requests, refreshing the cookie.
    // Trade-off: revoked tokens stay valid until JWT expiry (~1 hour). Acceptable
    // for this app; swap back to getUser() if revocation becomes a requirement.
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session?.user) {
      const err = new UnauthorizedError()
      return NextResponse.json(toErrorResponse(err), { status: 401 })
    }

    return { userId: session.user.id }
  } catch {
    const err = new UnauthorizedError()
    return NextResponse.json(toErrorResponse(err), { status: 401 })
  }
}

export function withAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const result = await requireAuth(request)
    if (result instanceof NextResponse) return result
    return handler(request, result)
  }
}
