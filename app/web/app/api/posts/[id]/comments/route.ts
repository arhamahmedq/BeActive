import type { NextRequest, NextResponse } from 'next/server'
import { handleGetComments, handleCreateComment } from '@/server/modules/interactions/interactions.controller'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleGetComments(request, id)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleCreateComment(request, id)
}
