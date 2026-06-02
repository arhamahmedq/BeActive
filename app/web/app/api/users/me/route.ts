import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { handleGetMe, handleUpdateMe } from '@/server/modules/users/users.controller'

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleGetMe(request)
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleUpdateMe(request)
}
