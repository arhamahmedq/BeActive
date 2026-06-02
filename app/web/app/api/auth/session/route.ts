import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as authService from '@/server/modules/auth/auth.service'
import { toErrorResponse, UnauthorizedError } from '@/server/core/errors/AppError'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const user = await authService.getSession(supabase)

    if (!user) {
      const err = new UnauthorizedError()
      return NextResponse.json(toErrorResponse(err), { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        onboarded: user.onboarded,
        createdAt: user.createdAt instanceof Date
          ? user.createdAt.toISOString()
          : user.createdAt,
      },
    })
  } catch {
    const err = new UnauthorizedError()
    return NextResponse.json(toErrorResponse(err), { status: 401 })
  }
}
