import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UnauthorizedError, toErrorResponse } from '../errors/AppError'

export interface AuthContext {
  userId: string
}

export async function requireAuth(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  try {
    // Mobile clients (iOS/Android) send bearer tokens; web uses HTTP-only cookies.
    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (bearerToken) {
      const supabase = await createClient()
      const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
      if (error || !user) {
        return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
      }
      return { userId: user.id }
    }

    // Web path: read JWT from HTTP-only cookie (no network round-trip).
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session?.user) {
      return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
    }

    return { userId: session.user.id }
  } catch {
    return NextResponse.json(toErrorResponse(new UnauthorizedError()), { status: 401 })
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
