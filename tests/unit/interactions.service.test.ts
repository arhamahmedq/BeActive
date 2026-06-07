import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/interactions/interactions.repo')
vi.mock('../../server/modules/posts/posts.service')

import {
  likePost,
  unlikePost,
  addComment,
  getComments,
  getEngagementSummaries,
  deleteComment,
} from '../../server/modules/interactions/interactions.service'
import * as repo from '../../server/modules/interactions/interactions.repo'
import * as postsService from '../../server/modules/posts/posts.service'
import { NotFoundError, ForbiddenError } from '../../server/core/errors/AppError'

const VISIBLE_POST = {
  id: 'post-1',
  imageUrl: 'https://x/p.jpg',
  imageKey: 'k',
  caption: null,
  status: 'VERIFIED',
  createdAt: new Date(),
  user: { id: 'author-1', username: 'author', avatarUrl: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: post is viewable (author or accepted friend). getPost enforces this.
  vi.mocked(postsService.getPost).mockResolvedValue(VISIBLE_POST as never)
})

describe('interactions.service.likePost', () => {
  it('checks visibility, creates the like, returns the fresh count', async () => {
    vi.mocked(repo.countLikes).mockResolvedValue(3)
    const r = await likePost('viewer', 'post-1')
    expect(postsService.getPost).toHaveBeenCalledWith('viewer', 'post-1')
    expect(repo.createLike).toHaveBeenCalledWith('post-1', 'viewer')
    expect(r).toEqual({ liked: true, likeCount: 3 })
  })

  it('is idempotent on a duplicate like (P2002) — no throw', async () => {
    vi.mocked(repo.createLike).mockRejectedValue(new Error('Unique constraint failed (P2002)'))
    vi.mocked(repo.countLikes).mockResolvedValue(1)
    expect(await likePost('viewer', 'post-1')).toEqual({ liked: true, likeCount: 1 })
  })

  it('rethrows a non-unique error', async () => {
    vi.mocked(repo.createLike).mockRejectedValue(new Error('db down'))
    await expect(likePost('viewer', 'post-1')).rejects.toThrow('db down')
  })

  it('refuses to like a post the viewer cannot see (NotFound from getPost)', async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(new NotFoundError('Post'))
    await expect(likePost('viewer', 'hidden')).rejects.toThrow(NotFoundError)
    expect(repo.createLike).not.toHaveBeenCalled()
  })
})

describe('interactions.service.unlikePost', () => {
  it('deletes idempotently and returns the fresh count', async () => {
    vi.mocked(repo.deleteLike).mockResolvedValue(1)
    vi.mocked(repo.countLikes).mockResolvedValue(0)
    const r = await unlikePost('viewer', 'post-1')
    expect(repo.deleteLike).toHaveBeenCalledWith('post-1', 'viewer')
    expect(r).toEqual({ liked: false, likeCount: 0 })
  })

  it('requires visibility', async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(new NotFoundError('Post'))
    await expect(unlikePost('viewer', 'hidden')).rejects.toThrow(NotFoundError)
    expect(repo.deleteLike).not.toHaveBeenCalled()
  })
})

describe('interactions.service.addComment', () => {
  it('creates a comment after the visibility check and returns an ISO-dated DTO', async () => {
    const d = new Date('2026-06-05T00:00:00Z')
    vi.mocked(repo.createComment).mockResolvedValue({
      id: 'c1',
      body: 'nice',
      createdAt: d,
      user: { id: 'viewer', username: 'v', avatarUrl: null },
    })
    const r = await addComment('viewer', 'post-1', 'nice')
    expect(repo.createComment).toHaveBeenCalledWith('post-1', 'viewer', 'nice')
    expect(r).toEqual({
      id: 'c1',
      body: 'nice',
      createdAt: d.toISOString(),
      user: { id: 'viewer', username: 'v', avatarUrl: null },
    })
  })

  it('requires visibility', async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(new NotFoundError('Post'))
    await expect(addComment('viewer', 'hidden', 'hi')).rejects.toThrow(NotFoundError)
    expect(repo.createComment).not.toHaveBeenCalled()
  })
})

describe('interactions.service.getComments', () => {
  const row = (id: string, ts: string) => ({
    id,
    body: `b-${id}`,
    createdAt: new Date(ts),
    user: { id: 'u', username: 'u', avatarUrl: null },
  })

  it('returns the page with nextCursor=null on the last page', async () => {
    vi.mocked(repo.listComments).mockResolvedValue([row('c1', '2026-06-05T00:00:00Z')])
    const r = await getComments('viewer', 'post-1', undefined, 20)
    expect(r.comments).toHaveLength(1)
    expect(r.nextCursor).toBeNull()
  })

  it('emits a nextCursor when there are more rows than the limit', async () => {
    vi.mocked(repo.listComments).mockResolvedValue([
      row('c1', '2026-06-05T00:02:00Z'),
      row('c2', '2026-06-05T00:01:00Z'),
      row('c3', '2026-06-05T00:00:00Z'),
    ])
    const r = await getComments('viewer', 'post-1', undefined, 2)
    expect(r.comments).toHaveLength(2)
    expect(r.nextCursor).not.toBeNull()
  })

  it('requires visibility', async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(new NotFoundError('Post'))
    await expect(getComments('viewer', 'hidden', undefined, 20)).rejects.toThrow(NotFoundError)
  })
})

describe('interactions.service.deleteComment', () => {
  const COMMENT = { id: 'c1', postId: 'post-1', userId: 'commenter-1' }

  beforeEach(() => {
    vi.mocked(repo.findCommentById).mockResolvedValue(COMMENT)
    vi.mocked(repo.deleteCommentById).mockResolvedValue(undefined)
  })

  it('commenter can delete their own comment', async () => {
    await deleteComment('commenter-1', 'post-1', 'c1')
    expect(repo.deleteCommentById).toHaveBeenCalledWith('c1')
  })

  it('post author can delete any comment (moderation)', async () => {
    await deleteComment('author-1', 'post-1', 'c1') // VISIBLE_POST.user.id = 'author-1'
    expect(repo.deleteCommentById).toHaveBeenCalledWith('c1')
  })

  it('throws ForbiddenError for a third party', async () => {
    await expect(deleteComment('stranger', 'post-1', 'c1')).rejects.toThrow(ForbiddenError)
    expect(repo.deleteCommentById).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when comment does not exist', async () => {
    vi.mocked(repo.findCommentById).mockResolvedValue(null)
    await expect(deleteComment('commenter-1', 'post-1', 'missing')).rejects.toThrow(NotFoundError)
    expect(repo.deleteCommentById).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when comment belongs to a different post', async () => {
    vi.mocked(repo.findCommentById).mockResolvedValue({ ...COMMENT, postId: 'other-post' })
    await expect(deleteComment('commenter-1', 'post-1', 'c1')).rejects.toThrow(NotFoundError)
    expect(repo.deleteCommentById).not.toHaveBeenCalled()
  })

  it('requires post visibility (getPost 404 propagates)', async () => {
    vi.mocked(postsService.getPost).mockRejectedValue(new NotFoundError('Post'))
    await expect(deleteComment('commenter-1', 'hidden', 'c1')).rejects.toThrow(NotFoundError)
    expect(repo.deleteCommentById).not.toHaveBeenCalled()
  })
})

describe('interactions.service.getEngagementSummaries', () => {
  it('maps repo rows to summary DTOs (no per-post visibility — feed pre-authorizes)', async () => {
    vi.mocked(repo.getEngagementSummaries).mockResolvedValue(
      new Map([['p1', { postId: 'p1', likeCount: 2, commentCount: 1, likedByMe: true }]]),
    )
    const m = await getEngagementSummaries(['p1'], 'viewer')
    expect(m.get('p1')).toEqual({ likeCount: 2, commentCount: 1, likedByMe: true })
    expect(postsService.getPost).not.toHaveBeenCalled()
  })
})
