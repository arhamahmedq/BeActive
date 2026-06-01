import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostStatus, WorkoutType } from '@prisma/client'

vi.mock('../../server/modules/ai/ai.service')
vi.mock('../../server/modules/ai/ai.repo')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))
vi.mock('../../server/modules/streaks/streaks.service', () => ({
  onWorkoutVerified: vi.fn().mockResolvedValue(undefined),
}))

import { processUploadedPost } from '../../server/workers/aiClassifier'
import * as aiService from '../../server/modules/ai/ai.service'
import * as aiRepo from '../../server/modules/ai/ai.repo'
import * as streaksService from '../../server/modules/streaks/streaks.service'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(aiRepo.findPostForClassification).mockResolvedValue(PENDING_POST)
  vi.mocked(aiRepo.markPostVerified).mockResolvedValue('workout-1')
  vi.mocked(aiRepo.markPostRejected).mockResolvedValue(undefined)
  vi.mocked(aiRepo.persistClassificationEvent).mockResolvedValue(undefined)
  vi.mocked(streaksService.onWorkoutVerified).mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
describe('processUploadedPost', () => {
  it('verifies post and emits WORKOUT_VERIFIED on high confidence', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostVerified).toHaveBeenCalledWith('post-1', VERIFIED_RESULT)
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WORKOUT_VERIFIED', userId: 'user-1' })
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

  it('leaves post as PENDING on ambiguous confidence (0.50–0.69)', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(AMBIGUOUS_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
    expect(aiRepo.markPostRejected).not.toHaveBeenCalled()
    expect(aiRepo.persistClassificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AI_CLASSIFICATION_AMBIGUOUS' })
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

  it('does not throw if event persistence fails (fire-and-forget safe)', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)
    vi.mocked(aiRepo.markPostVerified).mockResolvedValue('workout-1')
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

  it('threshold boundary: exactly 0.50 → AMBIGUOUS (not REJECTED)', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue({ ...AMBIGUOUS_RESULT, confidence: 0.50 })

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(aiRepo.markPostRejected).not.toHaveBeenCalled()
    expect(aiRepo.markPostVerified).not.toHaveBeenCalled()
  })

  it('calls onWorkoutVerified after VERIFIED post', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(VERIFIED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(streaksService.onWorkoutVerified).toHaveBeenCalledWith({ postId: 'post-1', userId: 'user-1' })
  })

  it('does not call onWorkoutVerified when post is REJECTED', async () => {
    vi.mocked(aiService.classifyImage).mockResolvedValue(REJECTED_RESULT)

    await processUploadedPost({ postId: 'post-1', imageUrl: 'https://r2.example.com/abc.jpg', userId: 'user-1' })

    expect(streaksService.onWorkoutVerified).not.toHaveBeenCalled()
  })
})
