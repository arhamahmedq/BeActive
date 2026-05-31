import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { handleGetPublicStreak } from '@/server/modules/streaks/streaks.controller'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId } = await params
  return handleGetPublicStreak(request, userId)
}
