// Devices controller — thin route handler, delegates to service.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { registerDeviceUserRateLimit } from '../../core/middleware/rateLimit'
import { ValidationError, toErrorResponse } from '../../core/errors/AppError'
import { registerDeviceSchema } from './devices.schema'
import { registerDevice } from './devices.service'

export async function handleRegisterDevice(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const limited = await registerDeviceUserRateLimit(authResult.userId, 'notifications/register-device')
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const err = new ValidationError([{ message: 'Invalid JSON body' }])
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  const parsed = registerDeviceSchema.safeParse(body)
  if (!parsed.success) {
    const err = new ValidationError(parsed.error.issues)
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  await registerDevice(authResult.userId, parsed.data)
  return NextResponse.json({ success: true })
}
