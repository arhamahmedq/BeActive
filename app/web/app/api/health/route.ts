import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// force-dynamic so this is never cached by CDN or Next.js
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, boolean> = {}

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = true
  } catch {
    checks.database = false
  }

  const ok = Object.values(checks).every(Boolean)
  return NextResponse.json(
    { ok, checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  )
}
