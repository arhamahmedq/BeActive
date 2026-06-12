import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { reprocessStalePendingPosts } from '@/server/workers/aiClassifier'
import { logger } from '@/server/core/logger/index'

// AI classification can retry up to ~21s of backoff alone, plus the verify
// transaction and notification fan-out — give the batch room to run.
export const runtime = 'nodejs'
export const maxDuration = 60

// Caps for the manual one-off backfill mode (?limit=&maxAgeMinutes=) — wide
// enough to drain a backlog of currently-stuck posts in a few requests
// without risking a single invocation exceeding maxDuration.
const MAX_BACKFILL_LIMIT = 50
const MIN_BACKFILL_AGE_MINUTES = 0

function parsePositiveInt(value: string | null, max: number): number | undefined {
  if (value === null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.min(Math.floor(n), max)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parsePositiveInt(searchParams.get('limit'), MAX_BACKFILL_LIMIT)
  const maxAgeMinutes = parsePositiveInt(searchParams.get('maxAgeMinutes'), Number.MAX_SAFE_INTEGER)
  const thresholdMs =
    maxAgeMinutes !== undefined ? Math.max(maxAgeMinutes, MIN_BACKFILL_AGE_MINUTES) * 60 * 1000 : undefined

  try {
    // Interval is approximate — keep in sync with the cron-job.org schedule.
    // See docs/DEPLOYMENT.md#cron-jobs-cron-joborg.
    const result = await Sentry.withMonitor(
      'reprocess-pending',
      () => reprocessStalePendingPosts(new Date(), { limit, thresholdMs }),
      { schedule: { type: 'interval', value: 5, unit: 'minute' }, timezone: 'UTC' }
    )
    logger.info('Reprocess-pending cron completed', result)
    return NextResponse.json({ ok: true, ...result }, { status: 200 })
  } catch (err) {
    logger.error('Reprocess-pending cron failed', { error: String(err) })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
