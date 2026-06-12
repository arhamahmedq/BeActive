import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostStatus, WorkoutType, NotificationType } from '@prisma/client'

vi.mock('../../server/modules/ai/ai.service')
vi.mock('../../server/modules/ai/ai.repo')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))
vi.mock('../../server/modules/streaks/streaks.service', () => ({
  onWorkoutVerified: vi.fn().mockResolvedValue(undefined),
}))
// Slice 7 notification fan-out deps — mocked so the wiring is asserted, not
// silently swallowed against unmocked prisma (the prior false-green).
vi.mock('../../server/modules/notifications/notifications.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../server/modules/friends/friends.service', () => ({
  getAcceptedFriendIds: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../server/modules/users/users.service', () => ({
  getProfile: vi.fn(),
}))
vi.mock('../../server/modules/stories/stories.service', () => ({
  generateAndPersistStory: vi.fn().mockResolvedValue(undefined),
}))
// The VERIFIED branch now runs inside prisma.$transaction. Mock it to invoke the
// callback with a stub tx so the wiring (markPostVerified → event → streak) is
// exercised; a callback rejection propagates exactly as a real rollback would.
vi.mock('../../app/web/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) },
}))

import { processUploadedPost, reprocessStalePendingPosts } from '../../server/workers/aiClassifier'
import * as aiService from '../../server/modules/ai/ai.service'
import * as aiRepo from '../../server/modules/ai/ai.repo'
import * as streaksService from '../../server/modules/streaks/streaks.service'
import * as notificationsService from '../../server/modules/notifications/notifications.service'
import * as friendsService from '../../server/modules/friends/friends.service'
import * as usersService from '../../server/modules/users/users.service'
import * as storiesService from '../../server/modules/stories/stories.service'

const VERIFIED_RESULT = {
  isWorkout: true,
  type: WorkoutType.GYM,
  confidence: 0.85,
  processingTimeMs: 1200,
  modelVersion: 'clip-vit-base-patch32-hf-v1',
}

const REJECTED_RESULT = {
  isWorkout: false,
  type: WorkoutType.OTHER,
  confidence: 0.30,
  processingTimeMs: 800,
  modelVersion: 'clip-vit-base-patch32-hf-v1',
}

const AMBIGUOUS_RESULT = {
  isWorkout: false,
  type: WorkoutType.GYM,
  confidence: 0.58,
  processingTimeMs: 900,
  modelVersion: 'clip-vit-base-patch32-hf-v1',
}

const PENDING_POST = {
  id: 'post-1',
  status: PostStatus.PENDING,
  imageUrl: 'https://r2.example.com/posts/user-1/abc.jpg',
  userId: 'user-1',
}

const POSTER_PROFILE = {
  id: 'user-1',
  email: 'poster@example.com',
  username: 'poster',
  displayName: 'Poster',
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  onboarded: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(aiRepo.findPostForClassification).mockResolvedValue(PENDING_POST)
  vi.mocked(aiRepo.markPostVerified).mockResolvedValue('workout-1')
  vi.mocked(aiRepo.markPostRejected).mockResolvedValue(undefined)
  vi.mocked(aiRepo.persistClassificationEvent).mockResolvedValue(undefined)
  vi.mocked(streaksService.onWorkoutVerified).mockResolvedValue(undefined)
  // clearAllMocks wipes call history but not implementations; set explicit
  // defaults so every test starts from a known notification baseline.
  vi.mocked(notificationsService.createNotification).mockResolvedValue(undefined)
  vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])
  vi.mocked(usersService.getProfile).mockResolvedValue(POSTER_PROFILE)
  vi.mocked(storiesService.generateAndPersistStory).mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
describe('processUploadedPost', () => {
  it('verifies post and emits WORKOUT_VERIFIED on high confidence', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostVerified).toHaveBeenCalledWith('post-1', VERIFIED_RESULT, expect.anything())
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WORKOUT_VERIFIED', userId: 'user-1' }),
      expect.anything()
    )
    expect(aiRepo.markPostRejected).not.toHaveBeenCalled()
  })

  it('rejects post and emits WORKOUT_REJECTED on low confidence', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(REJECTED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostRejected).toHaveBeenCalledWith('post-1')
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WORKOUT_REJECTED' })
    )
    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
  })

  it('rejects post on ambiguous confidence (0.50–0.69) — AMBIGUOUS collapsed into REJECTED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(AMBIGUOUS_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
    expect(aiRepo.markPostRejected).toHaveBeenCalledWith('post-1')
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WORKOUT_REJECTED' })
    )
  })

  it('skips processing if post is already VERIFIED (idempotency)', async () => {
    vi.mocked(aiRepo.findPostForClassification).mockResolvedValue({
      ...PENDING_POST,
      status: PostStatus.VERIFIED,
    })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiService.classifyImage).not.toHaveBeenCalled()
    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
  })

  it('skips processing if post is already REJECTED (idempotency)', async () => {
    vi.mocked(aiRepo.findPostForClassification).mockResolvedValue({
      ...PENDING_POST,
      status: PostStatus.REJECTED,
    })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiService.classifyImage).not.toHaveBeenCalled()
  })

  it('skips processing if post not found', async () => {
    vi.mocked(aiRepo.findPostForClassification).mockResolvedValue(null)

    await processUploadedPost({ postId: 'ghost', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiService.classifyImage).not.toHaveBeenCalled()
  })

  it('retries classification on failure (3 attempts) then leaves post PENDING', async () => {
    vi.mocked(aiService.classifyImage).mockRejectedValue(new Error('HF timeout'))

    // Patch sleep to avoid real delays in tests
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    // 3 attempts made
    expect(aiService.classifyImage).toHaveBeenCalledTimes(3)
    // Post stays PENDING — no verify or reject
    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
    expect(aiRepo.markPostRejected).not.toHaveBeenCalled()
    // Failure event logged
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AI_CLASSIFICATION_FAILED' })
    )
  })

  it('succeeds on second attempt after first failure', async () => {
    vi.mocked(aiService.classifyImage)
      .mockRejectedValueOnce(new Error('transient error'))
      .mockResolvedValueOnce(VERIFIED_RESULT)

    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiService.classifyImage).toHaveBeenCalledTimes(2)
    expect(aiRepo.markPostVerified).toHaveBeenCalledOnce()
  })

  it('a failure inside the verify transaction is caught and does not throw (rolls back)', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)
    vi.mocked(aiRepo.markPostVerified).mockResolvedValue('workout-1')
    // Event write fails → the whole transaction rejects (would roll back the
    // post verification in prod). The worker catches it, logs, and resolves.
    vi.mocked(aiRepo.persistClassificationEvent).mockRejectedValue(new Error('DB error'))

    await expect(
      processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })
    ).resolves.toBeUndefined()
  })

  it('threshold boundary: exactly 0.70 → VERIFIED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue({ ...VERIFIED_RESULT, confidence: 0.70 })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostVerified).toHaveBeenCalled()
  })

  it('threshold boundary: exactly 0.69 → REJECTED, exactly 0.70 → VERIFIED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue({ ...AMBIGUOUS_RESULT, confidence: 0.69 })
    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })
    expect(aiRepo.markPostRejected).toHaveBeenCalledWith('post-1')
    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
  })

  it('calls onWorkoutVerified inside the verify transaction', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    // Called with the shared tx client (3rd arg) so the streak update commits
    // atomically with markPostVerified.
    expect(streaksService.onWorkoutVerified).toHaveBeenCalledWith(
      { postId: 'post-1', userId: 'user-1' },
      undefined,
      expect.anything()
    )
  })

  it('does not call onWorkoutVerified when post is REJECTED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(REJECTED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(streaksService.onWorkoutVerified).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Notification wiring (Slice 7 audit — Critical Fix #3)
// ===========================================================================

function friendPostedCalls() {
  return vi
    .mocked(notificationsService.createNotification)
    .mock.calls.map((c) => c[0])
    .filter((p) => p.type === NotificationType.FRIEND_POSTED)
}

describe('processUploadedPost — notification wiring (Slice 7)', () => {
  beforeEach(() => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)
  })

  it('creates a WORKOUT_VERIFIED self-notification keyed by postId', async () => {
    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.WORKOUT_VERIFIED,
        idempotencyKey: 'post:post-1:WORKOUT_VERIFIED',
      })
    )
  })

  it('fans out FRIEND_POSTED to every accepted friend with per-friend idempotency keys', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-a', 'friend-b'])

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'friend-a',
        type: NotificationType.FRIEND_POSTED,
        title: '@poster just posted a workout',
        idempotencyKey: 'post:post-1:FRIEND_POSTED:friend-a',
      })
    )
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'friend-b',
        type: NotificationType.FRIEND_POSTED,
        idempotencyKey: 'post:post-1:FRIEND_POSTED:friend-b',
      })
    )
  })

  it('never sends FRIEND_POSTED to the poster themselves', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue(['friend-a'])

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(friendPostedCalls().every((p) => p.userId !== 'user-1')).toBe(true)
  })

  it('creates no FRIEND_POSTED when the user has no accepted friends', async () => {
    vi.mocked(friendsService.getAcceptedFriendIds).mockResolvedValue([])

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(friendPostedCalls()).toHaveLength(0)
  })

  it('does NOT notify anyone when the verification transaction rolls back', async () => {
    vi.mocked(aiRepo.markPostVerified).mockRejectedValueOnce(new Error('tx fail'))

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(notificationsService.createNotification).not.toHaveBeenCalled()
  })

  it('a self-notification failure does not throw out of processUploadedPost (awaited+caught)', async () => {
    vi.mocked(notificationsService.createNotification).mockRejectedValue(new Error('notif down'))

    await expect(
      processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })
    ).resolves.toBeUndefined()
  })
})

// ===========================================================================
// Story generation — fire-and-forget (P0.2)
// ===========================================================================
describe('processUploadedPost — story generation (P0.2)', () => {
  it('triggers story generation on VERIFIED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(storiesService.generateAndPersistStory).toHaveBeenCalledWith('post-1', 'user-1')
  })

  it('a story-generation failure does not throw out of processUploadedPost (fire-and-forget)', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)
    vi.mocked(storiesService.generateAndPersistStory).mockRejectedValue(new Error('satori boom'))

    await expect(
      processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })
    ).resolves.toBeUndefined()
  })

  it('does not generate a story when the post is REJECTED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(REJECTED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2/abc.jpg', userId: 'user-1' })

    expect(storiesService.generateAndPersistStory).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Reconciliation — reprocess stale PENDING posts (P0.1)
// ===========================================================================
describe('reprocessStalePendingPosts', () => {
  const STALE_POST_A = {
    id: 'post-a',
    imageUrl: 'https://r2.example.com/a.jpg',
    userId: 'user-a',
    createdAt: new Date('2026-06-01T00:00:00Z'),
  }
  const STALE_POST_B = {
    id: 'post-b',
    imageUrl: 'https://r2.example.com/b.jpg',
    userId: 'user-b',
    createdAt: new Date('2026-06-01T00:01:00Z'),
  }
  const NOW = new Date('2026-06-01T00:05:00Z')

  beforeEach(() => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)
  })

  it('is a no-op when there are no stale PENDING posts', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([])

    const result = await reprocessStalePendingPosts(NOW)

    expect(result).toEqual({ found: 0, succeeded: 0, failed: 0 })
    expect(aiService.classifyImage).not.toHaveBeenCalled()
  })

  it('queries with a 2-minute staleness cutoff and a bounded batch size', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([])

    await reprocessStalePendingPosts(NOW)

    expect(aiRepo.findStalePendingPosts).toHaveBeenCalledWith(
      new Date(NOW.getTime() - 2 * 60 * 1000),
      10
    )
  })

  it('reprocesses each stale post and reports success counts', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([STALE_POST_A, STALE_POST_B])
    vi.mocked(aiRepo.findPostForClassification)
      .mockResolvedValueOnce({ id: 'post-a', status: PostStatus.PENDING, imageUrl: STALE_POST_A.imageUrl, userId: 'user-a' })
      .mockResolvedValueOnce({ id: 'post-b', status: PostStatus.PENDING, imageUrl: STALE_POST_B.imageUrl, userId: 'user-b' })

    const result = await reprocessStalePendingPosts(NOW)

    expect(result).toEqual({ found: 2, succeeded: 2, failed: 0 })
    expect(aiRepo.markPostVerified).toHaveBeenCalledTimes(2)
  })

  it('skips a post that was already classified by the time the reconciler runs (idempotency)', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([STALE_POST_A])
    vi.mocked(aiRepo.findPostForClassification).mockResolvedValue({
      id: 'post-a',
      status: PostStatus.VERIFIED,
      imageUrl: STALE_POST_A.imageUrl,
      userId: 'user-a',
    })

    const result = await reprocessStalePendingPosts(NOW)

    expect(result).toEqual({ found: 1, succeeded: 1, failed: 0 })
    expect(aiService.classifyImage).not.toHaveBeenCalled()
  })

  it('counts a post as failed if reprocessing throws unexpectedly, and continues to the next', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([STALE_POST_A, STALE_POST_B])
    vi.mocked(aiRepo.findPostForClassification)
      .mockRejectedValueOnce(new Error('DB unreachable'))
      .mockResolvedValueOnce({ id: 'post-b', status: PostStatus.PENDING, imageUrl: STALE_POST_B.imageUrl, userId: 'user-b' })

    const result = await reprocessStalePendingPosts(NOW)

    expect(result).toEqual({ found: 2, succeeded: 1, failed: 1 })
  })

  it('stops early and reports truncated:true once the time budget is exceeded', async () => {
    vi.mocked(aiRepo.findStalePendingPosts).mockResolvedValue([STALE_POST_A, STALE_POST_B])
    vi.mocked(aiRepo.findPostForClassification).mockResolvedValue({
      id: 'post-a',
      status: PostStatus.PENDING,
      imageUrl: STALE_POST_A.imageUrl,
      userId: 'user-a',
    })

    // Date.now() calls: 1) startedAt, 2) budget check before post A (not yet
    // exceeded), 3) budget check before post B (exceeded) — breaks before
    // post B is ever looked up.
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(50_000)

    const result = await reprocessStalePendingPosts(NOW)

    expect(result).toEqual({ found: 2, succeeded: 1, failed: 0, truncated: true })
    expect(aiRepo.findPostForClassification).toHaveBeenCalledTimes(1)
  })
})
