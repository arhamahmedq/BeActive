import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { evaluateStreaks } from '@/server/workers/streakEvaluator'
import { logger } from '@/server/core/logger/index'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await evaluateStreaks()
    logger.info('Streak evaluator cron completed', result)
    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (err) {
    logger.error('Streak evaluator cron failed', { error: String(err) })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
