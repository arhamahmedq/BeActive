import type { NextRequest, NextResponse } from 'next/server'
import { handleReportStoryShared } from '@/server/modules/stories/stories.controller'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  const { postId } = await params
  return handleReportStoryShared(request, postId)
}
