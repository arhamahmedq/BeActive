import type { NextRequest, NextResponse } from 'next/server'
import { handleGetPublicProfile } from '@/server/modules/users/users.controller'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<NextResponse> {
  const { username } = await params
  return handleGetPublicProfile(request, username)
}
