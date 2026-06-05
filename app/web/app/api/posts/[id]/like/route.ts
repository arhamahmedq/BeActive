import type { NextRequest, NextResponse } from 'next/server'
import { handleLikePost, handleUnlikePost } from '@/server/modules/interactions/interactions.controller'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleLikePost(request, id)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleUnlikePost(request, id)
}
