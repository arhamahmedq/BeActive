import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostStatus, StreakStatus, WorkoutType } from '@prisma/client'

// Reproduction + regression guard for the reported failure:
//   "New user (streak=0) → upload → AI verifies → backend confirms success
//    → BUT streak does NOT update."
//
// Investigation outcome (see git history / streaks.service unit tests):
//   - The streak SERVICE logic is correct for new users: INACTIVE → ACTIVE
//     yields current:1 (proven by tests/unit/streaks/streaks.service.test.ts).
//   - The ONLY way the symptom occurs is if the streak update is contingent on
//     an in-memory event-bus listener that isn't registered on the process
//     instance handling the request. The streak increment has NO reconciliation
//     path (the cron only breaks streaks), so a missed listener loses it forever.
//
// Correct architecture: the streak update on WORKOUT_VERIFIED is a DIRECT,
// AWAITED call inside aiClassifier.processUploadedPost — never a bus handler.
//
// This test pins that contract: a verified workout updates a brand-new user's
// streak to current:1 WITHOUT any event-bus handler being registered. If anyone
// reroutes the streak update back onto the best-effort bus, this test fails.

vi.mock('../../server/modules/ai/ai.service')
vi.mock('../../server/modules/ai/ai.repo')
vi.mock('../../server/modules/streaks/streaks.repo')
// Mock the pure engine: computation correctness is proven in recomputeStreak.test.ts.
// This test is about the wiring (direct call), not the math.
vi.mock('../../server/modules/streaks/recomputeStreak', () => ({
  recomputeStreak: vi.fn().mockReturnValue({
    currentStreak: 1,
    bestStreak: 1,
    lastVerifiedDate: '2024-01-15',
    status: StreakStatus.ACTIVE,
  }),
  toLocalDateStr: vi.fn().mockReturnValue('2024-01-15'),
}))
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))
// The verify path now runs inside prisma.$transaction. Stub it to invoke the
// callback with a fake tx — keeps this a pure wiring test (no live DB) while the
// direct-call contract (no event bus) is still what's being pinned.
vi.mock('../../app/web/lib/prisma', () => ({
  prisma: { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) },
}))

import { processUploadedPost } from '../../server/workers/aiClassifier'
import * as aiService from '../../server/modules/ai/ai.service'
import * as aiRepo from '../../server/modules/ai/ai.repo'
import * as streakRepo from '../../server/modules/streaks/streaks.repo'

const POST_CREATED_AT = new Date('2024-01-15T10:00:00Z')

const NEW_USER_STREAK = {
  id: 'streak-1',
  userId: 'user-new',
  current: 0,
  best: 0,
  status: StreakStatus.INACTIVE,
  lastVerifiedDate: null,
  brokenAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()

  // AI says: definitely a workout, high confidence → VERIFIED path
  vi.mocked(aiService.classifyImage).mockResolvedValue({
    isWorkout: true,
    type: WorkoutType.GYM,
    confidence: 0.92,
    processingTimeMs: 120,
    modelVersion: 'test-model',
  })

  vi.mocked(aiRepo.findPostForClassification).mockResolvedValue({
    id: 'post-1',
    status: PostStatus.PENDING,
    imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
    userId: 'user-new',
  })
  vi.mocked(aiRepo.markPostVerified).mockResolvedValue('workout-1')
  vi.mocked(aiRepo.markPostRejected).mockResolvedValue(undefined)
  vi.mocked(aiRepo.persistClassificationEvent).mockResolvedValue(undefined)

  // Brand-new user: streak row exists (atomic with signup) but is INACTIVE/0
  vi.mocked(streakRepo.getPostCreatedAt).mockResolvedValue(POST_CREATED_AT)
  vi.mocked(streakRepo.getStreakByUserId).mockResolvedValue(NEW_USER_STREAK)
  vi.mocked(streakRepo.getUserTimezone).mockResolvedValue('UTC')
  vi.mocked(streakRepo.createDailyCompletion).mockResolvedValue(undefined)
  vi.mocked(streakRepo.getCompletionsForUser).mockResolvedValue([{ localDate: '2024-01-15' }])
  vi.mocked(streakRepo.updateStreak).mockResolvedValue(undefined)
  vi.mocked(streakRepo.persistStreakEvent).mockResolvedValue(undefined)
})

describe('processUploadedPost — new user (streak = 0), no bus listener registered', () => {
  it('updates the new user streak to current:1 without any event-bus handler', async () => {
    // Deliberately do NOT call registerEventHandlers(). If the streak update
    // depended on the bus, this would silently no-op (the reported bug).
    await processUploadedPost({
      postId: 'post-1',
      imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
      userId: 'user-new',
      correlationId: 'post-1',
    })

    expect(streakRepo.updateStreak).toHaveBeenCalledWith(
      'user-new',
      expect.objectContaining({
        current: 1,
        best: 1,
        status: StreakStatus.ACTIVE,
        lastVerifiedDate: '2024-01-15',
        brokenAt: null,
      }),
      expect.anything()
    )
    expect(streakRepo.persistStreakEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STREAK_UPDATED', userId: 'user-new' }),
      expect.anything()
    )
  })

  it('inserts a DailyCompletion for the verified post', async () => {
    await processUploadedPost({
      postId: 'post-1',
      imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
      userId: 'user-new',
    })

    expect(streakRepo.createDailyCompletion).toHaveBeenCalledWith(
      { userId: 'user-new', localDate: '2024-01-15', postId: 'post-1', timezone: 'UTC' },
      expect.anything()
    )
  })

  it('uses post.createdAt to compute localDate for the completion', async () => {
    await processUploadedPost({
      postId: 'post-1',
      imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
      userId: 'user-new',
    })

    expect(streakRepo.getPostCreatedAt).toHaveBeenCalledWith('post-1', expect.anything())
    expect(streakRepo.createDailyCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
      expect.anything()
    )
  })

  it('persists the WORKOUT_VERIFIED audit event independent of the streak update', async () => {
    await processUploadedPost({
      postId: 'post-1',
      imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
      userId: 'user-new',
      correlationId: 'post-1',
    })

    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WORKOUT_VERIFIED', userId: 'user-new' }),
      expect.anything()
    )
  })

  it('skips streak update when the local day is not after lastVerifiedDate (monotonic gate)', async () => {
    // Streak already credited for today's local date ('2024-01-15' from the
    // mocked toLocalDateStr) → the monotonic gate short-circuits before any
    // completion insert or streak write, but does not throw (post stays verified).
    vi.mocked(streakRepo.getStreakByUserId).mockResolvedValue({
      ...NEW_USER_STREAK,
      current: 1,
      best: 1,
      status: StreakStatus.ACTIVE,
      lastVerifiedDate: '2024-01-15',
    })

    await processUploadedPost({
      postId: 'post-1',
      imageUrl: 'https://cdn.example/posts/user-new/post-1.jpg',
      userId: 'user-new',
    })

    expect(streakRepo.createDailyCompletion).not.toHaveBeenCalled()
    expect(streakRepo.updateStreak).not.toHaveBeenCalled()
  })
})
