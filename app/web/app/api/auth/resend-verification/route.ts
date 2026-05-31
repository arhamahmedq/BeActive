import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as authService from '@/server/modules/auth/auth.service'
import { createRateLimiter } from '@/server/core/middleware/rateLimit'
import { z } from 'zod'

const resendRateLimit = createRateLimiter({ maxRequests: 3, windowMs: 60_000 })

const resendSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = resendRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  let body: unknown
  try {
    body = await request.json()
  } catch {
    // Always return success — do not reveal anything about account state
    return NextResponse.json({ status: 'RESENT' })
  }

  const parsed = resendSchema.safeParse(body)
  if (parsed.success) {
    const supabase = await createClient()
    await authService.resendVerification(supabase, parsed.data.email)
  }

  // Always 200 — prevents email enumeration
  return NextResponse.json({ status: 'RESENT' })
}
