import type { NextRequest, NextResponse } from 'next/server'
import { handleMarkRead } from '@/server/modules/notifications/notifications.controller'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleMarkRead(request)
}
