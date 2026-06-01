import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { handleGetMyStreak } from '@/server/modules/streaks/streaks.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetMyStreak(request)
}
