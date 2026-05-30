import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as authService from '@/server/modules/auth/auth.service'
import { requireAuth } from '@/server/core/middleware/auth'
import { isAppError, toErrorResponse, InternalError } from '@/server/core/errors/AppError'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = await createClient()
    await authService.logout(supabase)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: err.statusCode })
    }
    const internalErr = new InternalError()
    return NextResponse.json(toErrorResponse(internalErr), { status: 500 })
  }
}
