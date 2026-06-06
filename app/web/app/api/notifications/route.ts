import type { NextRequest, NextResponse } from 'next/server'
import { handleGetNotifications } from '@/server/modules/notifications/notifications.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetNotifications(request)
}
