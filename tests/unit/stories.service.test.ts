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

import { buildStoryPayload, getOrRenderStory, recordStoryShared } from '../../server/modules/stories/stories.service'
import * as postsService from '../../server/modules/posts/posts.service'
import * as streaksService from '../../server/modules/streaks/streaks.service'
import * as storiesRepo from '../../server/modules/stories/stories.repo'
import * as r2 from '@/lib/storage/r2'
import { renderStoryPng } from '@/lib/story-card/renderStoryPng'
import { NotFoundError } from '../../server/core/errors/AppError'
import { EventType } from '@/lib/events/types'

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
  vi.mocked(storiesRepo.persistEvent).mockResolvedValue(undefined)
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
    expect(payload.shareVersion).toBe(2)
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
  it('serves cached bytes same-origin (no redirect) when READY and the object exists', async () => {
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
    vi.mocked(r2.objectExists).mockResolvedValue(true)
    vi.mocked(r2.getObject).mockResolvedValue({ buffer: Buffer.from('cached-png'), contentType: 'image/png' })

    const result = await getOrRenderStory('post-1', 'user-1')

    // Proxies the cached bytes (r2.dev has no CORS, so we never 302 cross-origin).
    expect(r2.getObject).toHaveBeenCalledWith('stories/post-1/2.png')
    expect(result.buffer.toString()).toBe('cached-png')
    expect(result.contentType).toBe('image/png')
    expect(r2.putObject).not.toHaveBeenCalled()
  })

  it('renders and persists a fresh story when none exists yet', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 2 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/2.png')

    const result = await getOrRenderStory('post-1', 'user-1')

    expect(result.buffer.toString()).toBe('png-bytes')
    expect(result.contentType).toBe('image/png')
    expect(r2.putObject).toHaveBeenCalledWith(
      'story-src/post-1.jpg',
      expect.any(Buffer),
      'image/jpeg',
      expect.any(String)
    )
    expect(r2.putObject).toHaveBeenCalledWith(
      'stories/post-1/2.png',
      expect.any(Buffer),
      'image/png',
      expect.any(String)
    )
    expect(storiesRepo.markStoryReady).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ assetKey: 'stories/post-1/2.png', assetUrl: 'https://cdn.example.com/stories/post-1/2.png' })
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

    expect(result.contentType).toBe('image/png')
    expect(storiesRepo.upsertPendingStory).toHaveBeenCalledWith('post-1', 'user-1', expect.any(Object), 2)
    expect(r2.putObject).toHaveBeenCalledWith(
      'stories/post-1/2.png',
      expect.any(Buffer),
      'image/png',
      expect.any(String)
    )
  })

  it('treats a stale-version cached row as a miss and re-renders to the current version', async () => {
    // A card rendered before a design bump: READY + object present, but its
    // shareVersion is behind CURRENT_SHARE_VERSION. It must NOT be served from
    // cache — it should re-render so the owner gets the new design.
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue({
      id: 'story-1',
      postId: 'post-1',
      userId: 'user-1',
      payload: {} as never,
      shareVersion: 1, // stale: older than CURRENT_SHARE_VERSION (2)
      status: 'READY' as never,
      assetKey: 'stories/post-1/1.png',
      assetUrl: 'https://cdn.example.com/stories/post-1/1.png',
    })
    vi.mocked(r2.objectExists).mockResolvedValue(true)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 2 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes-v2'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/2.png')

    const result = await getOrRenderStory('post-1', 'user-1')

    // Did NOT serve the stale cached object...
    expect(r2.getObject).not.toHaveBeenCalled()
    // ...re-rendered and wrote the new versioned asset instead.
    expect(result.buffer.toString()).toBe('png-bytes-v2')
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

  it('emits STORY_GENERATED after a fresh render', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 2 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/2.png')

    await getOrRenderStory('post-1', 'user-1')

    expect(storiesRepo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EventType.STORY_GENERATED,
        userId: 'user-1',
        source: 'stories.service',
        correlationId: 'post-1',
        payload: expect.objectContaining({
          postId: 'post-1',
          shareVersion: 2,
          workoutType: 'RUNNING',
          streakCount: 10,
          isPersonalBest: true,
        }),
      })
    )
  })

  it('does not emit STORY_GENERATED when serving a cached card', async () => {
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
    vi.mocked(r2.objectExists).mockResolvedValue(true)
    vi.mocked(r2.getObject).mockResolvedValue({ buffer: Buffer.from('cached-png'), contentType: 'image/png' })

    await getOrRenderStory('post-1', 'user-1')

    expect(storiesRepo.persistEvent).not.toHaveBeenCalled()
  })

  it('does not fail the render when persisting STORY_GENERATED rejects', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)
    vi.mocked(storiesRepo.upsertPendingStory).mockResolvedValue({ id: 'story-1', shareVersion: 1 })
    vi.mocked(renderStoryPng).mockResolvedValue(Buffer.from('png-bytes'))
    vi.mocked(r2.buildPublicUrl).mockReturnValue('https://cdn.example.com/stories/post-1/1.png')
    vi.mocked(storiesRepo.persistEvent).mockRejectedValue(new Error('db down'))

    const result = await getOrRenderStory('post-1', 'user-1')

    expect(result.buffer.toString()).toBe('png-bytes')
    expect(storiesRepo.markStoryFailed).not.toHaveBeenCalled()
  })
})

describe('recordStoryShared', () => {
  const STORY_ROW = {
    id: 'story-1',
    postId: 'post-1',
    userId: 'user-1',
    payload: { workoutType: 'RUNNING', streakCount: 10 } as never,
    shareVersion: 2,
    status: 'READY' as never,
    assetKey: 'stories/post-1/2.png',
    assetUrl: 'https://cdn.example.com/stories/post-1/2.png',
  }

  it('persists STORY_SHARED with fields from the story payload', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(STORY_ROW)

    await recordStoryShared('post-1', 'user-1', 'web_share')

    expect(storiesRepo.persistEvent).toHaveBeenCalledWith({
      type: EventType.STORY_SHARED,
      userId: 'user-1',
      payload: {
        postId: 'post-1',
        shareVersion: 2,
        method: 'web_share',
        workoutType: 'RUNNING',
        streakCount: 10,
      },
      source: 'stories.service',
      correlationId: 'post-1',
    })
  })

  it('throws NotFoundError when the story does not exist', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue(null)

    await expect(recordStoryShared('post-1', 'user-1', 'download')).rejects.toThrow(NotFoundError)
    expect(storiesRepo.persistEvent).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the story belongs to a different user', async () => {
    vi.mocked(storiesRepo.getStoryByPostId).mockResolvedValue({ ...STORY_ROW, userId: 'someone-else' })

    await expect(recordStoryShared('post-1', 'user-1', 'download')).rejects.toThrow(NotFoundError)
    expect(storiesRepo.persistEvent).not.toHaveBeenCalled()
  })
})
