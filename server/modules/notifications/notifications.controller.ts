// Notifications controller — thin route handlers, delegates to service.
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '../../core/middleware/auth'
import { generalRateLimit } from '../../core/middleware/rateLimit'
import { ValidationError, toErrorResponse } from '../../core/errors/AppError'
import { getNotificationsQuerySchema, markReadSchema } from './notifications.schema'
import { getNotifications, markRead } from './notifications.service'

export async function handleGetNotifications(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const limited = generalRateLimit(request)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const parsed = getNotificationsQuerySchema.safeParse({
    cursor: searchParams.get('cursor') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    const err = new ValidationError(parsed.error.issues)
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  const result = await getNotifications(authResult.userId, parsed.data.cursor, parsed.data.limit)
  return NextResponse.json(result)
}

export async function handleMarkRead(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const limited = generalRateLimit(request)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    const err = new ValidationError([{ message: 'Invalid JSON body' }])
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  const parsed = markReadSchema.safeParse(body)
  if (!parsed.success) {
    const err = new ValidationError(parsed.error.issues)
    return NextResponse.json(toErrorResponse(err), { status: 400 })
  }

  await markRead(authResult.userId, parsed.data)
  return NextResponse.json({ success: true })
}
