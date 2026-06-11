import type { NextRequest, NextResponse } from 'next/server'
import { handleGetStory } from '@/server/modules/stories/stories.controller'

// Pin to the Node runtime (sharp needs native bindings; @vercel/og needs Node)
// with the Pro 60s ceiling — the cold render (image fetch + sharp + Satori)
// can exceed the Hobby 10s default and crash the worker mid-stream.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  const { postId } = await params
  return handleGetStory(request, postId)
}
