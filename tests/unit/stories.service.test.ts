import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/posts/posts.service')
vi.mock('../../server/modules/streaks/streaks.service')
vi.mock('../../server/modules/stories/stories.repo')
vi.mock('@/lib/storage/r2')
vi.mock('@/lib/story-card/renderStoryPng', () => ({
  renderStoryPng: vi.fn(),
}))
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('jpeg-bytes')),
  })),
}))

import { buildStoryPayload, getOrRenderStory } from '../../server/modules/stories/stories.service'
import * as postsService from '../../server/modules/posts/posts.service'
import * as streaksService from '../../server/modules/streaks/streaks.service'
import * as storiesRepo from '../../server/modules/stories/stories.repo'
import * as r2 from '@/lib/storage/r2'
import { renderStoryPng } from '@/lib/story-card/renderStoryPng'
import { NotFoundError } from '../../server/core/errors/AppError'

const VERIFIED_POST = {
  id: 'post-1',
  imageUrl: 'https://cdn.example.com/posts/post-1.jpg',
  imageKey: 'posts/post-1.jpg',
  caption: null,
  status: 'VERIFIED',
  createdAt: new Date('2026-06-01T00:00:00Z'),
  user: { id: 'user-1', username: 'alice', avatarUrl: null },
  workout: { type: 'RUNNING', aiConfidence: 0.95 },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(postsService.getPost).mockResolvedValue(VERIFIED_POST as never)
  vi.mocked(streaksService.getMyStreak).mockResolvedValue({
    current: 10,
    best: 10,
    status: 'ACTIVE',
    lastVerifiedDate: '2026-06-01',
    completedToday: true,
    displayTier: 'COMPLETED_TODAY',
    userTimezone: 'UTC',
  } as never)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from('source-bytes')),
    })
  )
})

describe('buildStoryPayload', () => {
  it('snapshots post + streak + plant into a StoryPayload', async () => {
    const payload = await buildStoryPayload('post-1', 'user-1')

    expect(payload.postId).toBe('post-1')
    expect(payload.userId).toBe('user-1')
    expect(payload.username).toBe('alice')
    expect(payload.avatarUrl).toBeNull()
    expect(payload.workoutType).toBe('RUNNING')
    expect(payload.workoutLabel).toBe('RUN')
    expect(payload.streakCount).toBe(10)
    expect(payload.bestStreak).toBe(10)
    expect(payload.isPersonalBest).toBe(true)
    expect(payload.storySrcKey).toBe('story-src/post-1.jpg')
    expect(payload.shareVersion).toBe(1)
  })

  it('defaults streak fields to 0 and is not a personal best when there is no streak', async () => {
    vi.mocked(streaksService.getMyStreak).mockResolvedValue(null)

    const payload = await buildStoryPayload('post-1', 'user-1')

    expect(payload.streakCount).toBe(0)
    expect(payload.bestStreak).toBe(0)
    expect(payload.isPersonalBest).toBe(false)
    expect(payload.plantName).toBe('Dormant Seed')
  })

  it('throws NotFoundError when the requesting user does not own the post', async () => {
    vi.mocked(postsService.getPost).mockResolvedValue({
      ...VERIFIED_POST,
      user: { id: 'someone-else', username: 'bob', avatarUrl: null },
    } as never)

    await expect(buildStoryPayload('post-1', 'user-1')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError when the post is not VERIFIED', async () => {
    vi.mocked(postsService.getPost).mockResolvedValue({
      ...VERIFIED_POST,
      status: 'PENDING',
    } as never)

    await expect(buildStoryPayload('post-1', 'user-1')).rejects.toThrow(NotFoundError)
  })
})

describe('getOrRenderStory', () => {
  it('redirects to the cached asset when the story is READY and the object exists', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue({
      id: 'story-1',
      postId: 'post-1',
      userId: 'user-1',
      payload: {} as never,
      shareVersion: 1,
      status: 'READY' as never,
      assetKey: 'stories/post-1/1.png',
      assetUrl: 'https://cdn.example.com/stories/post-1/1.png',
    })
    vi.mocked(r2.objectExists).mockResolvedValue(true)

    const result = await getOrRenderStory('post-1', 'user-1')

    expect(result).toEqual({ kind: 'redirect', url: 'https://cdn.example.com/stories/post-1/1.png' })
    expect(r2.putObject).not.toHaveBeenCalled()
  })

  it('renders and persists a fresh story when none exists yet', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 1 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/1.png')

    const result = await getOrRenderStory('post-1', 'user-1')

    expect(result.kind).toBe('buffer')
    if (result.kind === 'buffer') {
      expect(result.buffer.toString()).toBe('png-bytes')
      expect(result.contentType).toBe('image/png')
    }
    expect(r2.putObject).toHaveBeenCalledWith(
      'story-src/post-1.jpg',
      expect.any(Buffer),
      'image/jpeg',
      expect.any(String)
    )
    expect(r2.putObject).toHaveBeenCalledWith(
      'stories/post-1/1.png',
      expect.any(Buffer),
      'image/png',
      expect.any(String)
    )
    expect(storiesRepo.markStoryReady).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ assetKey: 'stories/post-1/1.png', assetUrl: 'https://cdn.example.com/stories/post-1/1.png' })
    )
  })

  it('re-renders when a story row exists but the cached object is missing', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue({
      id: 'story-1',
      postId: 'post-1',
      userId: 'user-1',
      payload: {} as never,
      shareVersion: 2,
      status: 'READY' as never,
      assetKey: 'stories/post-1/2.png',
      assetUrl: 'https://cdn.example.com/stories/post-1/2.png',
    })
    vi.mocked(r2.objectExists).mockResolvedValue(false)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 2 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes-v2'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/2.png')

    const result = await getOrRenderStory('post-1', 'user-1')

    expect(result.kind).toBe('buffer')
    expect(storiesRepo.upsertPendingStory).toHaveBeenCalledWith('post-1', 'user-1', expect.any(Object), 2)
    expect(r2.putObject).toHaveBeenCalledWith(
      'stories/post-1/2.png',
      expect.any(Buffer),
      'image/png',
      expect.any(String)
    )
  })

  it('marks the story as failed and rethrows when rendering fails', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 1 })
    vi.mocked(renderStoryPng).mockRejectedValue(new Error('satori boom'))
    vi.mocked(storiesRepo.markStoryFailed).mockResolvedValue(undefined)

    await expect(getOrRenderStory('post-1', 'user-1')).rejects.toThrow('satori boom')
    expect(storiesRepo.markStoryFailed).toHaveBeenCalledWith('story-1', expect.stringContaining('satori boom'))
  })

  it('throws NotFoundError for a non-owner before touching storage', async () => {
    vi.mocked(postsService.getPost).mockResolvedValue({
      ...VERIFIED_POST,
      user: { id: 'someone-else', username: 'bob', avatarUrl: null },
    } as never)

    await expect(getOrRenderStory('post-1', 'user-1')).rejects.toThrow(NotFoundError)
    expect(storiesRepo.getStoryByPostId).not.toHaveBeenCalled()
  })
})
