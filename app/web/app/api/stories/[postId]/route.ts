import type { NextRequest, NextResponse } from 'next/server'
import { handleGetStory } from '@/server/modules/stories/stories.controller'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  const { postId } = await params
  return handleGetStory(request, postId)
}
