import { Client, Receiver } from '@upstash/qstash'
import { logger } from '../logger/index'

// ---------------------------------------------------------------------------
// QStash wrapper — Phase D classification queue.
//
// publishJSON() enqueues a message; QStash later POSTs the same JSON body to
// the destination URL with an `Upstash-Signature` header. verifySignature()
// checks that header against the current/next signing key pair (key rotation
// support is built into Receiver.verify — it tries current, falls back to next).
// ---------------------------------------------------------------------------

export interface ClassificationJobPayload {
  postId: string
  imageUrl: string
  userId: string
  correlationId?: string
}

let _client: Client | null | undefined

function getClient(): Client | null {
  if (_client !== undefined) return _client
  const token = process.env.QSTASH_TOKEN
  _client = token ? new Client({ token }) : null
  return _client
}

// Returns true if the job was enqueued. Callers must treat `false` the same
// as a thrown after()-handler today: log it and leave the post PENDING — the
// reprocess-pending reconciler is the safety net for queue-publish failures.
export async function enqueueClassificationJob(payload: ClassificationJobPayload): Promise<boolean> {
  const client = getClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!client || !appUrl) {
    logger.error('QStash not configured — cannot enqueue classification job', { postId: payload.postId })
    return false
  }

  try {
    await client.publishJSON({
      url: `${appUrl}/api/queue/classify`,
      body: payload,
    })
    return true
  } catch (err) {
    logger.error('Failed to enqueue classification job', { postId: payload.postId, error: String(err) })
    return false
  }
}

let _receiver: Receiver | null | undefined

function getReceiver(): Receiver | null {
  if (_receiver !== undefined) return _receiver
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  _receiver = currentSigningKey && nextSigningKey ? new Receiver({ currentSigningKey, nextSigningKey }) : null
  return _receiver
}

// Verifies the `Upstash-Signature` header against the raw request body and
// destination URL. Returns false (never throws) on missing config, missing
// signature, or an invalid/expired signature.
export async function verifyClassificationJobSignature(
  signature: string | null,
  body: string,
  url: string
): Promise<boolean> {
  const receiver = getReceiver()
  if (!receiver || !signature) return false

  try {
    return await receiver.verify({ signature, body, url })
  } catch (err) {
    logger.error('QStash signature verification failed', { error: String(err) })
    return false
  }
}
