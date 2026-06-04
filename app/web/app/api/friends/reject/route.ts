import type { NextRequest, NextResponse } from 'next/server'
import { handleRejectFriendRequest } from '@/server/modules/friends/friends.controller'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRejectFriendRequest(request)
}
