import type { NextRequest, NextResponse } from 'next/server'
import { handleRegisterDevice } from '@/server/modules/devices/devices.controller'

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRegisterDevice(request)
}
