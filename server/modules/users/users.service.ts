import { NotFoundError, RateLimitError, ForbiddenError } from '../../core/errors/AppError'
import {
  getUserById,
  updateUserProfile,
  getTimezoneThrottleState,
  getUserByUsername,
  getFriendCount,
  getVerifiedPostCount,
  getUserVerifiedPosts,
} from './users.repo'
import { areFriends, getRelationshipState } from '../friends/friends.service'
import type { UserProfile, UpdateProfileInput } from './users.types'
import type {
  PublicProfileResponse,
  ProfilePostsResponse,
  ProfilePost,
} from '../../../shared/types/profile'

// Anti-cheat: the streak's "today" is derived from the user's timezone, so an
// unthrottled timezone field is a streak-inflation lever (move the clock forward
// to manufacture a new local day). Cap real changes to N per rolling 24h window.
const TZ_MAX_CHANGES_PER_24H = 3
const TZ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function getProfile(userId: string): Promise<UserProfile> {
  const user = await getUserById(userId)
  if (!user) throw new NotFoundError('User')
  return user
}

// _now is injectable so the throttle window can be tested without mocking Date.
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  _now: Date = new Date()
): Promise<UserProfile> {
  const existing = await getUserById(userId)
  if (!existing) throw new NotFoundError('User')

  // Throttle only a genuine change to a new timezone value (re-submitting the
  // same timezone, or updating only displayName/bio, never counts).
  const isRealTzChange = input.timezone !== undefined && input.timezone !== existing.timezone
  if (!isRealTzChange) {
    return updateUserProfile(userId, input)
  }

  const throttle = (await getTimezoneThrottleState(userId)) ?? { tzChangedAt: null, tzChangeCount: 0 }
  const windowActive =
    throttle.tzChangedAt !== null && _now.getTime() - throttle.tzChangedAt.getTime() < TZ_WINDOW_MS
  const countInWindow = windowActive ? throttle.tzChangeCount : 0

  if (countInWindow >= TZ_MAX_CHANGES_PER_24H) {
    throw new RateLimitError()
  }

  // Keep the window anchored at its first change; reset the anchor when the
  // previous 24h window has lapsed.
  return updateUserProfile(userId, input, {
    tzChangedAt: windowActive ? throttle.tzChangedAt! : _now,
    tzChangeCount: countInWindow + 1,
  })
}

// ---------------------------------------------------------------------------
// Public profile (Slice 8A) — identity is discoverable; the posts grid is
// friends-only (mirrors the feed; honors "no public feed"). Blocked = hidden.
// ---------------------------------------------------------------------------

const PROFILE_POSTS_MAX_LIMIT = 30

function encodeProfileCursor(p: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ c: p.createdAt.toISOString(), i: p.id })).toString('base64url')
}

function decodeProfileCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { c: string; i: string }
    const createdAt = new Date(o.c)
    if (Number.isNaN(createdAt.getTime()) || typeof o.i !== 'string') return null
    return { createdAt, id: o.i }
  } catch {
    return null
  }
}

export async function getPublicProfile(
  viewerId: string,
  username: string,
): Promise<PublicProfileResponse> {
  const user = await getUserByUsername(username)
  if (!user) throw new NotFoundError('User')

  const relationship = await getRelationshipState(viewerId, user.id)
  // A blocked pair is fully hidden — same response as a non-existent user.
  if (relationship === 'blocked') throw new NotFoundError('User')

  const [friendCount, postCount] = await Promise.all([
    getFriendCount(user.id),
    getVerifiedPostCount(user.id),
  ])

  return {
    profile: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      streak: { current: user.streak?.current ?? 0, best: user.streak?.best ?? 0 },
      friendCount,
      postCount,
    },
    relationship, // narrowed: 'blocked' already threw above
  }
}

export async function getUserPostsByUsername(
  viewerId: string,
  username: string,
  cursorRaw: string | undefined,
  limit: number,
): Promise<ProfilePostsResponse> {
  const user = await getUserByUsername(username)
  if (!user) throw new NotFoundError('User')

  // Friends-only: the workout grid is visible only to the owner or accepted friends.
  const canView = viewerId === user.id || (await areFriends(viewerId, user.id))
  if (!canView) throw new ForbiddenError()

  const effectiveLimit = Math.min(Math.max(limit, 1), PROFILE_POSTS_MAX_LIMIT)
  const cursor = decodeProfileCursor(cursorRaw)
  const rows = await getUserVerifiedPosts(user.id, cursor, effectiveLimit)

  const hasMore = rows.length > effectiveLimit
  const pageRows = hasMore ? rows.slice(0, effectiveLimit) : rows
  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last ? encodeProfileCursor({ createdAt: last.createdAt, id: last.id }) : null

  const posts: ProfilePost[] = pageRows.map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl,
    caption: r.caption,
    createdAt: r.createdAt.toISOString(),
    workout: r.workout ? { type: r.workout.type } : null,
  }))

  return { posts, nextCursor }
}
