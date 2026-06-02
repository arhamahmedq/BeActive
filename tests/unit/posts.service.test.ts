import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPost, getPost } from '../../server/modules/posts/posts.service'
import * as repo from '../../server/modules/posts/posts.repo'
import * as usersService from '../../server/modules/users/users.service'
import { ConflictError, ForbiddenError, NotFoundError } from '../../server/core/errors/AppError'

vi.mock('../../server/modules/posts/posts.repo')
vi.mock('../../server/modules/users/users.service')
vi.mock('../../server/core/logger/index', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}))

const MOCK_POST = {
  id: 'post-1',
  imageUrl: 'https://r2.example.com/posts/user-1/abc.jpg',
  imageKey: 'posts/user-1/abc.jpg',
  caption: null,
  status: 'PENDING',
  createdAt: new Date(),
}

const MOCK_PROFILE = {
  id: 'user-1',
  email: 'a@b.com',
  username: 'user1',
  displayName: null,
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  onboarded: true,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.R2_PUBLIC_URL = 'https://r2.example.com'
  vi.mocked(usersService.getProfile).mockResolvedValue(MOCK_PROFILE)
})

// ---------------------------------------------------------------------------
// createPost
// ---------------------------------------------------------------------------
describe('createPost', () => {
  it('creates a post and returns it', async () => {
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(false)
    vi.mocked(repo.createPost).mockResolvedValue(MOCK_POST)
    vi.mocked(repo.persistEvent).mockResolvedValue(undefined)

    const result = await createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })

    expect(result.id).toBe('post-1')
    expect(result.status).toBe('PENDING')
    expect(repo.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', imageKey: 'posts/user-1/abc.jpg' })
    )
  })

  it('derives imageUrl from R2_PUBLIC_URL — never trusts client URL', async () => {
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(false)
    vi.mocked(repo.createPost).mockResolvedValue(MOCK_POST)
    vi.mocked(repo.persistEvent).mockResolvedValue(undefined)

    await createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })

    const callArg = vi.mocked(repo.createPost).mock.calls[0][0]
    expect(callArg.imageUrl).toBe('https://r2.example.com/posts/user-1/abc.jpg')
  })

  it('rejects if user already has a post today', async () => {
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(true)

    await expect(createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })).rejects.toThrow(
      ConflictError
    )
    expect(repo.createPost).not.toHaveBeenCalled()
  })

  it('rejects if imageKey does not belong to the requesting user', async () => {
    await expect(
      createPost('user-1', { imageKey: 'posts/user-999/abc.jpg' })
    ).rejects.toThrow(ForbiddenError)
    expect(repo.hasActivePostForLocalDate).not.toHaveBeenCalled()
  })

  it('emits WORKOUT_UPLOADED event after post creation (fire-and-forget)', async () => {
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(false)
    vi.mocked(repo.createPost).mockResolvedValue(MOCK_POST)
    vi.mocked(repo.persistEvent).mockResolvedValue(undefined)

    await createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })

    expect(repo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'WORKOUT_UPLOADED',
        userId: 'user-1',
        payload: expect.objectContaining({ postId: 'post-1' }),
      })
    )
  })

  it('does not throw if event persistence fails', async () => {
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(false)
    vi.mocked(repo.createPost).mockResolvedValue(MOCK_POST)
    vi.mocked(repo.persistEvent).mockRejectedValue(new Error('DB error'))

    await expect(createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })).resolves.toBeDefined()
  })

  it('handles trailing slash in R2_PUBLIC_URL correctly', async () => {
    process.env.R2_PUBLIC_URL = 'https://r2.example.com/'
    vi.mocked(repo.hasActivePostForLocalDate).mockResolvedValue(false)
    vi.mocked(repo.createPost).mockResolvedValue(MOCK_POST)
    vi.mocked(repo.persistEvent).mockResolvedValue(undefined)

    await createPost('user-1', { imageKey: 'posts/user-1/abc.jpg' })

    const callArg = vi.mocked(repo.createPost).mock.calls[0][0]
    // Trailing slash must not produce a double-slash in the path segment
    expect(callArg.imageUrl).toBe('https://r2.example.com/posts/user-1/abc.jpg')
  })
})

// ---------------------------------------------------------------------------
// getPost
// ---------------------------------------------------------------------------
describe('getPost', () => {
  it('returns post when found', async () => {
    vi.mocked(repo.findPostById).mockResolvedValue(MOCK_POST)

    const result = await getPost('post-1')
    expect(result.id).toBe('post-1')
  })

  it('throws NotFoundError when post does not exist', async () => {
    vi.mocked(repo.findPostById).mockResolvedValue(null)

    await expect(getPost('nonexistent')).rejects.toThrow(NotFoundError)
  })
})
