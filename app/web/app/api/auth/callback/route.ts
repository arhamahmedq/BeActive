import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as authService from '@/server/modules/auth/auth.service'
import { logger } from '@/server/core/logger/index'
import { signupSchema } from '@/server/modules/auth/auth.schema'
import { isAppError } from '@/server/core/errors/AppError'

// Derive the app origin from the environment variable instead of from the
// request Host header, which can be spoofed in non-Vercel environments.
function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const appUrl = getAppUrl()

  if (!code) {
    return NextResponse.redirect(`${appUrl}/signup?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    // Code may be expired or already used. If the user already has an active
    // session (re-clicked an old link), send them to the feed instead of erroring.
    const { data: currentSession } = await supabase.auth.getUser()
    if (currentSession?.user) {
      return NextResponse.redirect(`${appUrl}/feed`)
    }
    logger.error('Callback code exchange failed', { errorName: error?.name })
    return NextResponse.redirect(`${appUrl}/signup?error=verification_failed`)
  }

  const { user } = data
  const username = user.user_metadata?.username as string | undefined

  if (!username) {
    logger.error('No username in user metadata after verification', { userId: user.id })
    return NextResponse.redirect(`${appUrl}/signup?error=missing_username`)
  }

  // Re-validate against our schema — prevents bypassing Zod via direct Supabase API calls
  const usernameCheck = signupSchema.shape.username.safeParse(username)
  if (!usernameCheck.success) {
    logger.error('Invalid username in Supabase metadata after verification', { userId: user.id })
    return NextResponse.redirect(`${appUrl}/signup?error=invalid_username`)
  }

  if (!user.email) {
    logger.error('No email on verified Supabase user', { userId: user.id })
    return NextResponse.redirect(`${appUrl}/signup?error=account_creation_failed`)
  }

  try {
    await authService.createUserOnVerification(user.id, user.email, username)
  } catch (err) {
    logger.error('Failed to create Prisma user on verification', {
      userId: user.id,
      error: String(err),
    })
    // ConflictError = username was taken by another user between signup and verification
    const isConflict = isAppError(err) && err.code === 'CONFLICT'
    return NextResponse.redirect(
      `${appUrl}/signup?error=${isConflict ? 'username_taken' : 'account_creation_failed'}`
    )
  }

  return NextResponse.redirect(`${appUrl}/onboarding`)
}
