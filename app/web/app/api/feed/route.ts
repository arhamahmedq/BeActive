import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { handleGetFeed } from '@/server/modules/feed/feed.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetFeed(request)
}
