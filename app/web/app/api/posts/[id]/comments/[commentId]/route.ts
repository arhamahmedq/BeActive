import type { NextRequest, NextResponse } from 'next/server'
import { handleDeleteComment } from '@/server/modules/interactions/interactions.controller'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<NextResponse> {
  const { id, commentId } = await params
  return handleDeleteComment(request, id, commentId)
}
