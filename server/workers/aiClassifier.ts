import { PostStatus, NotificationType } from '@prisma/client'
import { prisma } from '../../app/web/lib/prisma'
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
import { createNotification } from '../modules/notifications/notifications.service'
import { getAcceptedFriendIds } from '../modules/friends/friends.service'
import { getProfile } from '../modules/users/users.service'

// Confidence thresholds per AI_BOUNDARY.md.
// AMBIGUOUS (0.50–0.69) is intentionally collapsed into REJECTED — there is no
// manual review pipeline, so leaving posts PENDING forever is a worse UX than
// a clear rejection that lets the user re-upload.
const VERIFY_THRESHOLD = 0.70

// 3 attempts: backoff 1s → 4s → 16s
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getDecision(confidence: number): ClassificationDecision {
  return confidence >= VERIFY_THRESHOLD ? 'VERIFIED' : 'REJECTED'
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
    // Rule R1 + R3 as ONE atomic unit. The post flip to VERIFIED, the
    // WORKOUT_VERIFIED event, and the streak completion + projection all commit
    // together or not at all. This closes the former best-effort gap where a
    // VERIFIED post could end up with no streak credit because a later step
    // failed and its error was swallowed.
    //
    // If the transaction throws (any step fails, including the streak update or
    // a concurrent same-day DailyCompletion race), EVERYTHING rolls back: the
    // post is left PENDING — never VERIFIED-without-streak. A PENDING post is
    // recoverable (the upload UI's "still checking" path / a re-classification);
    // a silently uncredited streak is not. Correctness over convenience.
    //
    // Streak update uses post.createdAt (inside the service), not AI time.
    try {
      await prisma.$transaction(async (tx) => {
        const workoutId = await markPostVerified(postId, result, tx)
        await persistClassificationEvent(
          {
            type: EventType.WORKOUT_VERIFIED,
            userId,
            payload: { postId, workoutId, type: result.type, confidence: result.confidence, modelVersion: result.modelVersion },
            source: 'ai.worker',
            correlationId,
          },
          tx
        )
        await onWorkoutVerified({ postId, userId }, undefined, tx)
      })
    } catch (e: unknown) {
      logger.error('Verified-workout transaction rolled back — post left PENDING', {
        postId,
        error: String(e),
      })
      // Transaction rolled back — do not notify.
      return
    }

    // Post-transaction self-notification (outside the tx — a duplicate is harmless,
    // a missing streak credit is not, so the tx boundary stays narrow).
    // Awaited (not a detached void) so the enclosing after() callback keeps the
    // serverless invocation alive until the write lands — a fire-and-forget
    // promise can be dropped when the function returns. The .catch keeps a
    // notification failure non-fatal and prevents it from rolling anything back.
    await createNotification({
      userId,
      type: NotificationType.WORKOUT_VERIFIED,
      title: 'Workout verified',
      body: 'Your streak has been updated.',
      data: { postId },
      idempotencyKey: `post:${postId}:WORKOUT_VERIFIED`,
    }).catch((e: unknown) => {
      logger.error('Failed to create WORKOUT_VERIFIED notification', { postId, error: String(e) })
    })

    // R7: notify each accepted friend — one profile fetch, one friend-ids fetch,
    // then parallel per-friend creates. Awaited for the same reason as the self
    // notification above: it must finish inside the after() window, not after it.
    // Still outside the transaction so a notify failure never rolls back the streak.
    await (async () => {
      try {
        const [friendIds, poster] = await Promise.all([
          getAcceptedFriendIds(userId),
          getProfile(userId),
        ])
        if (friendIds.length === 0) return
        await Promise.all(
          friendIds.map((friendId) =>
            createNotification({
              userId: friendId,
              type: NotificationType.FRIEND_POSTED,
              title: `@${poster.username} just posted a workout`,
              data: { postId, posterUserId: userId },
              // Per-friend key so retries don't duplicate per recipient.
              idempotencyKey: `post:${postId}:FRIEND_POSTED:${friendId}`,
            }).catch((e: unknown) => {
              logger.error('Failed to create FRIEND_POSTED notification', {
                friendId,
                postId,
                error: String(e),
              })
            })
          )
        )
      } catch (e: unknown) {
        logger.error('Failed R7 friend fan-out for verified workout', { postId, error: String(e) })
      }
    })()

  } else {
    // Rule R2 — confidence < 0.70 → REJECTED (AMBIGUOUS collapsed into REJECTED)
    await markPostRejected(postId)
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
