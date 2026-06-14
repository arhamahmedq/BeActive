import { PostStatus, NotificationType } from '@prisma/client'
import { prisma } from '../../app/web/lib/prisma'
import { logger } from '../core/logger/index'
import { EventType } from '../core/events/index'
import { classifyImage } from '../modules/ai/ai.service'
import {
  findPostForClassification,
  findStalePendingPosts,
  markPostVerified,
  markPostRejected,
  incrementClassificationAttempts,
  persistClassificationEvent,
} from '../modules/ai/ai.repo'
import type { ClassificationOutput, ClassificationDecision } from '../modules/ai/ai.types'
import { onWorkoutVerified } from '../modules/streaks/streaks.service'
import { createNotification } from '../modules/notifications/notifications.service'
import { getAcceptedFriendIds } from '../modules/friends/friends.service'
import { getProfile } from '../modules/users/users.service'
import { generateAndPersistStory } from '../modules/stories/stories.service'

// Confidence thresholds per AI_BOUNDARY.md.
// AMBIGUOUS (0.50–0.69) is intentionally collapsed into REJECTED — there is no
// manual review pipeline, so leaving posts PENDING forever is a worse UX than
// a clear rejection that lets the user re-upload.
const VERIFY_THRESHOLD = 0.70

// 3 attempts: backoff 1s → 4s → 16s
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1_000

// Poison-post cap (H1): each invocation that exhausts MAX_ATTEMPTS bumps
// Post.classificationAttempts by 1. Once a post has failed this many separate
// invocations (initial after() + reconciler retries), give up and REJECT it —
// an image that never classifies would otherwise be retried by the reconciler
// forever. This is an operational timeout, not an AI decision.
const CLASSIFICATION_GIVEUP_THRESHOLD = 5

// Reconciliation: posts left PENDING longer than this were dropped by the
// after()-based trigger (instance reclaimed, function killed, etc.) — see
// processUploadedPost's idempotency guard, which makes re-running it safe even
// if the original after() eventually does complete.
const STALE_PENDING_THRESHOLD_MS = 2 * 60 * 1000
const RECONCILE_BATCH_LIMIT = 10

// Each post can take up to ~21s of classification backoff alone. A full batch
// of RECONCILE_BATCH_LIMIT could exceed the route's maxDuration (60s), getting
// the function killed mid-batch with nothing reported. Bail out before that —
// the remaining stale posts simply get picked up on the next cron run.
const RECONCILE_TIME_BUDGET_MS = 45 * 1000

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
    // All retries exhausted for this invocation.
    const attempts = await incrementClassificationAttempts(postId)

    if (attempts >= CLASSIFICATION_GIVEUP_THRESHOLD) {
      // Poison post: bounded number of full-retry invocations have all failed.
      // Reject so the reconciler stops retrying — user can re-upload.
      logger.error('AI worker: classification attempt cap reached, rejecting post', {
        postId,
        attempts,
      })
      await markPostRejected(postId)
      try {
        await persistClassificationEvent({
          type: EventType.WORKOUT_REJECTED,
          userId,
          payload: { postId, reason: 'classification_unavailable', attempts },
          source: 'ai.worker',
          correlationId,
        })
      } catch (e: unknown) {
        logger.error('Failed to persist WORKOUT_REJECTED event (classification_unavailable)', {
          postId,
          error: String(e),
        })
      }
      await createNotification({
        userId,
        type: NotificationType.WORKOUT_REJECTED,
        title: "We couldn't verify this workout",
        body: 'Please try uploading a clearer photo of your workout.',
        data: { postId },
        idempotencyKey: `post:${postId}:CLASSIFICATION_GAVE_UP`,
      }).catch((e: unknown) => {
        logger.error('Failed to create CLASSIFICATION_GAVE_UP notification', {
          postId,
          error: String(e),
        })
      })
      return
    }

    // Post stays PENDING — the reconciler will retry on a later cron run,
    // up to CLASSIFICATION_GIVEUP_THRESHOLD total invocations.
    logger.error('AI worker: classification permanently failed for this invocation, post left as PENDING', {
      postId,
      attempts,
    })
    void persistClassificationEvent({
      type: 'AI_CLASSIFICATION_FAILED',
      userId,
      payload: { postId, reason: 'exhausted_retries', attempts },
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
      title: 'Workout verified — share your story',
      body: 'Your streak has been updated. Tap to share a story card.',
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

    // Story Sharing V3 — pre-render and persist the share card so the share
    // button's read path is a fast cache-aside hit. Fire-and-forget (not
    // awaited): the streak-critical work above has already committed, and the
    // share route renders on demand if this never finishes — it must not
    // extend the after() window the verify transaction depends on.
    void generateAndPersistStory(postId, userId).catch((e: unknown) => {
      logger.error('Story generation failed', { postId, error: String(e) })
    })

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

// Reconciliation: re-run classification for posts whose after()-based trigger
// was dropped (instance reclaimed/killed before or during processing — see
// the upload pipeline investigation). processUploadedPost is idempotent (it
// re-checks status === PENDING before doing anything), so re-invoking it for
// a post whose original after() actually did complete is a harmless no-op.
//
// Sequential, small batch — this runs on a frequent external cron
// (cron-job.org), so a backlog drains over a few runs rather than risking a
// single invocation exceeding maxDuration.
export async function reprocessStalePendingPosts(
  now: Date = new Date(),
  options?: { thresholdMs?: number; limit?: number }
): Promise<{ found: number; succeeded: number; failed: number; truncated?: boolean }> {
  const thresholdMs = options?.thresholdMs ?? STALE_PENDING_THRESHOLD_MS
  const limit = options?.limit ?? RECONCILE_BATCH_LIMIT
  const cutoff = new Date(now.getTime() - thresholdMs)
  const stale = await findStalePendingPosts(cutoff, limit)

  const startedAt = Date.now()
  let succeeded = 0
  let failed = 0
  let truncated = false

  for (const post of stale) {
    if (Date.now() - startedAt > RECONCILE_TIME_BUDGET_MS) {
      truncated = true
      break
    }

    logger.info('Reconciler: reprocessing stale PENDING post', {
      postId: post.id,
      ageMs: now.getTime() - post.createdAt.getTime(),
    })
    try {
      await processUploadedPost({
        postId: post.id,
        imageUrl: post.imageUrl,
        userId: post.userId,
        correlationId: post.id,
      })
      succeeded++
    } catch (e: unknown) {
      failed++
      logger.error('Reconciler: failed to reprocess stale PENDING post', {
        postId: post.id,
        error: String(e),
      })
    }
  }

  if (stale.length > 0) {
    logger.info('Reconciler: run complete', { found: stale.length, succeeded, failed, truncated })
  }

  return truncated ? { found: stale.length, succeeded, failed, truncated } : { found: stale.length, succeeded, failed }
}
