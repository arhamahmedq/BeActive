import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/AppError'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import {
  createPost as repoCreatePost,
  findPostById,
  hasActivePostForLocalDate,
  persistEvent,
} from './posts.repo'
import { getProfile } from '../users/users.service'
import { areFriends } from '../friends/friends.service'
import type { CreatePostInput, PostResponse } from './posts.types'

function buildPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) throw new Error('R2_PUBLIC_URL env var is missing')
  return `${base.replace(/\/$/, '')}/${key}`
}

function validateKeyOwnership(userId: string, key: string): void {
  const expectedPrefix = `posts/${userId}/`
  if (!key.startsWith(expectedPrefix)) {
    throw new ForbiddenError()
  }
}

// _now is injectable so tests can fix the clock without mocking Date globally.
export async function createPost(
  userId: string,
  input: CreatePostInput,
  _now?: Date
): Promise<PostResponse> {
  validateKeyOwnership(userId, input.imageKey)

  // Resolve the user's timezone so the same-day guard matches the streak
  // engine's local-calendar-day notion of "today" (not UTC).
  const { timezone } = await getProfile(userId)

  const alreadyPosted = await hasActivePostForLocalDate(userId, timezone, _now ?? new Date())
  if (alreadyPosted) {
    throw new ConflictError('You have already submitted a workout post today')
  }

  const imageUrl = buildPublicUrl(input.imageKey)

  const post = await repoCreatePost({
    userId,
    imageKey: input.imageKey,
    imageUrl,
    caption: input.caption,
  })

  void persistEvent({
    type: EventType.WORKOUT_UPLOADED,
    userId,
    payload: { postId: post.id, imageKey: input.imageKey, imageUrl },
    source: 'posts.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist WORKOUT_UPLOADED event', { error: String(err) })
  })

  logger.info('Post created', { postId: post.id, userId })
  return post
}

// Central post-visibility guard. A post is viewable ONLY by its author or an
// accepted friend of the author (reuses the Friends graph — no new graph logic).
// A non-viewer gets NotFoundError (404), never 403, so this can't be used to
// probe which post IDs exist. Apply to every post read endpoint.
export async function assertCanViewPost(viewerId: string, authorId: string): Promise<void> {
  if (viewerId === authorId) return
  if (await areFriends(viewerId, authorId)) return
  throw new NotFoundError('Post')
}

export async function getPost(viewerId: string, postId: string): Promise<PostResponse> {
  const post = await findPostById(postId)
  if (!post) throw new NotFoundError('Post')

  const authorId = post.user?.id
  if (!authorId) throw new NotFoundError('Post')
  await assertCanViewPost(viewerId, authorId)

  return post
}
