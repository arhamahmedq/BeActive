import type { NextRequest, NextResponse } from 'next/server'
import { handleSendFriendRequest } from '@/server/modules/friends/friends.controller'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleSendFriendRequest(request)
}
