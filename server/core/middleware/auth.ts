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
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      const err = new UnauthorizedError()
      return NextResponse.json(toErrorResponse(err), { status: 401 })
    }

    return { userId: user.id }
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
