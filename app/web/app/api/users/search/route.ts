import type { NextRequest, NextResponse } from 'next/server'
import { handleSearchUsers } from '@/server/modules/friends/friends.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleSearchUsers(request)
}
