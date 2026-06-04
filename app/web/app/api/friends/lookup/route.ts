import type { NextRequest, NextResponse } from 'next/server'
import { handleLookupFriendship } from '@/server/modules/friends/friends.lookup.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleLookupFriendship(request)
}
