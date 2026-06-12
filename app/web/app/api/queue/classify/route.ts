import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { processUploadedPost } from '@/server/workers/aiClassifier'
import { verifyClassificationJobSignature } from '@/server/core/queue/qstash'
import { classificationJobSchema } from '@/server/modules/ai/ai.schema'
import { logger } from '@/server/core/logger/index'

// QStash delivers the classification job here. Same worst-case duration as
// the after() callback it replaces — see aiClassifier.ts (~21s retry backoff
// + verify transaction + notifications).
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get('upstash-signature')
  const rawBody = await request.text()

  const verified = await verifyClassificationJobSignature(signature, rawBody, request.url)
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = classificationJobSchema.safeParse(parsedBody)
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
  }

  try {
    await processUploadedPost(result.data)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    logger.error('Queue classify handler threw unexpectedly', {
      postId: result.data.postId,
      error: String(err),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
