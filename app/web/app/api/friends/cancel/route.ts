import type { NextRequest, NextResponse } from 'next/server'
import { handleCancelFriendRequest } from '@/server/modules/friends/friends.controller'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleCancelFriendRequest(request)
}
