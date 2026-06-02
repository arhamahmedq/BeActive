import { PostStatus } from '@prisma/client'
import { logger } from '../core/logger/index'
import { EventType } from '../core/events/index'
import { classifyImage } from '../modules/ai/ai.service'
import {
  findPostForClassification,
  markPostVerified,
  markPostRejected,
  persistClassificationEvent,
} from '../modules/ai/ai.repo'
import type { ClassificationOutput, ClassificationDecision } from '../modules/ai/ai.types'
import { onWorkoutVerified } from '../modules/streaks/streaks.service'

// Confidence thresholds per AI_BOUNDARY.md
const VERIFY_THRESHOLD = 0.70
const AMBIGUOUS_THRESHOLD = 0.50

// 3 attempts: backoff 1s → 4s → 16s
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getDecision(confidence: number): ClassificationDecision {
  if (confidence >= VERIFY_THRESHOLD) return 'VERIFIED'
  if (confidence >= AMBIGUOUS_THRESHOLD) return 'AMBIGUOUS'
  return 'REJECTED'
}

async function classifyWithRetry(imageUrl: string): Promise<ClassificationOutput | null> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await classifyImage(imageUrl)
    } catch (err) {
      lastError = err
      const isLast = attempt === MAX_ATTEMPTS
      logger.error('AI classification attempt failed', {
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        error: String(err),
        willRetry: !isLast,
      })
      if (!isLast) {
        await sleep(BACKOFF_BASE_MS * Math.pow(4, attempt - 1))
      }
    }
  }
  logger.error('AI classification exhausted all retries', { error: String(lastError) })
  return null
}

export async function processUploadedPost(params: {
  postId: string
  imageUrl: string
  userId: string
  correlationId?: string
}): Promise<void> {
  const { postId, imageUrl, userId, correlationId } = params

  // Idempotency: skip if post is no longer PENDING
  const post = await findPostForClassification(postId)
  if (!post) {
    logger.error('AI worker: post not found', { postId })
    return
  }
  if (post.status !== PostStatus.PENDING) {
    logger.info('AI worker: post already classified, skipping', { postId, status: post.status })
    return
  }

  logger.info('AI worker: classifying image', { postId, userId })
  const result = await classifyWithRetry(imageUrl)

  if (!result) {
    // All retries exhausted — post stays PENDING for manual review
    logger.error('AI worker: classification permanently failed, post left as PENDING', { postId })
    void persistClassificationEvent({
      type: 'AI_CLASSIFICATION_FAILED',
      userId,
      payload: { postId, reason: 'exhausted_retries' },
      source: 'ai.worker',
      correlationId,
    }).catch((e: unknown) =>
      logger.error('Failed to persist AI_CLASSIFICATION_FAILED', { error: String(e) })
    )
    return
  }

  const decision = getDecision(result.confidence)
  logger.info('AI worker: classification complete', {
    postId,
    confidence: result.confidence,
    decision,
    type: result.type,
    processingTimeMs: result.processingTimeMs,
  })

  if (decision === 'VERIFIED') {
    // Rule R1 — confidence >= 0.70 → VERIFIED
    const workoutId = await markPostVerified(postId, result)
    // Awaited so Slice 4 (Streak Engine) reliably sees WORKOUT_VERIFIED in the event log.
    // Caught so a DB failure here doesn't unwind the already-committed post status.
    try {
      await persistClassificationEvent({
        type: EventType.WORKOUT_VERIFIED,
        userId,
        payload: { postId, workoutId, type: result.type, confidence: result.confidence, modelVersion: result.modelVersion },
        source: 'ai.worker',
        correlationId,
      })
    } catch (e: unknown) {
      logger.error('Failed to persist WORKOUT_VERIFIED event', { postId, error: String(e) })
    }

    // R3: Update the streak via a DIRECT, AWAITED call — NOT through the event bus.
    // The streak increment is a must-happen state invariant with no reconciliation
    // path (the cron only breaks streaks, never re-increments). Routing it through
    // the in-memory bus would make it contingent on a listener being registered on
    // this exact process/bundle instance — in serverless that is best-effort, and a
    // miss silently loses the increment forever. Keep this direct and guaranteed.
    // Uses post.createdAt (inside the service), not AI processing time.
    try {
      await onWorkoutVerified({ postId, userId })
    } catch (e: unknown) {
      logger.error('Failed to update streak on WORKOUT_VERIFIED', { postId, error: String(e) })
    }

  } else if (decision === 'AMBIGUOUS') {
    // 0.50–0.69 — stays PENDING, recorded for manual review
    void persistClassificationEvent({
      type: 'AI_CLASSIFICATION_AMBIGUOUS',
      userId,
      payload: { postId, confidence: result.confidence, modelVersion: result.modelVersion },
      source: 'ai.worker',
      correlationId,
    }).catch((e: unknown) =>
      logger.error('Failed to persist AI_CLASSIFICATION_AMBIGUOUS', { error: String(e) })
    )

  } else {
    // Rule R2 — confidence < 0.50 → REJECTED
    await markPostRejected(postId)
    // Awaited so the rejection event is reliably recorded alongside the state change.
    try {
      await persistClassificationEvent({
        type: EventType.WORKOUT_REJECTED,
        userId,
        payload: { postId, confidence: result.confidence, reason: 'confidence_below_threshold' },
        source: 'ai.worker',
        correlationId,
      })
    } catch (e: unknown) {
      logger.error('Failed to persist WORKOUT_REJECTED event', { postId, error: String(e) })
    }
  }
}
