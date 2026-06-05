import type { NextRequest, NextResponse } from 'next/server'
import { handleGetPendingFriendships } from '@/server/modules/friends/friends.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetPendingFriendships(request)
}
