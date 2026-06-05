import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/users/users.repo')
vi.mock('../../server/modules/friends/friends.service')

import {
  updateProfile,
  getPublicProfile,
  getUserPostsByUsername,
} from '../../server/modules/users/users.service'
import * as repo from '../../server/modules/users/users.repo'
import * as friendsService from '../../server/modules/friends/friends.service'
import { AppError, NotFoundError, ForbiddenError } from '../../server/core/errors/AppError'

const NOW = new Date('2024-06-01T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000)

const EXISTING = {
  id: 'user-1',
  email: 'a@b.com',
  username: 'tester',
  displayName: null,
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  onboarded: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.getUserById).mockResolvedValue(EXISTING)
  vi.mocked(repo.updateUserProfile).mockResolvedValue(EXISTING)
  vi.mocked(repo.getTimezoneThrottleState).mockResolvedValue({ tzChangedAt: null, tzChangeCount: 0 })
})

describe('updateProfile — timezone-change throttle', () => {
  it('does not consult the throttle when timezone is not part of the update', async () => {
    await updateProfile('user-1', { displayName: 'New Name' }, NOW)

    expect(repo.getTimezoneThrottleState).not.toHaveBeenCalled()
    expect(repo.updateUserProfile).toHaveBeenCalledWith('user-1', { displayName: 'New Name' })
  })

  it('does not consult the throttle when the timezone is unchanged', async () => {
    await updateProfile('user-1', { timezone: 'UTC' }, NOW)

    expect(repo.getTimezoneThrottleState).not.toHaveBeenCalled()
    expect(repo.updateUserProfile).toHaveBeenCalledWith('user-1', { timezone: 'UTC' })
  })

  it('allows a first timezone change and opens a fresh 24h window', async () => {
    await updateProfile('user-1', { timezone: 'America/New_York' }, NOW)

    expect(repo.updateUserProfile).toHaveBeenCalledWith(
      'user-1',
      { timezone: 'America/New_York' },
      { tzChangedAt: NOW, tzChangeCount: 1 }
    )
  })

  it('allows further changes within the window and preserves the window anchor', async () => {
    const anchor = hoursAgo(1)
    vi.mocked(repo.getTimezoneThrottleState).mockResolvedValue({ tzChangedAt: anchor, tzChangeCount: 2 })

    await updateProfile('user-1', { timezone: 'America/New_York' }, NOW)

    expect(repo.updateUserProfile).toHaveBeenCalledWith(
      'user-1',
      { timezone: 'America/New_York' },
      { tzChangedAt: anchor, tzChangeCount: 3 }
    )
  })

  it('rejects the 4th change within 24h with a 429 RateLimitError', async () => {
    vi.mocked(repo.getTimezoneThrottleState).mockResolvedValue({ tzChangedAt: hoursAgo(2), tzChangeCount: 3 })

    await expect(
      updateProfile('user-1', { timezone: 'America/New_York' }, NOW)
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 })
    await expect(
      updateProfile('user-1', { timezone: 'America/New_York' }, NOW)
    ).rejects.toBeInstanceOf(AppError)
    expect(repo.updateUserProfile).not.toHaveBeenCalled()
  })

  it('resets the counter once the previous 24h window has lapsed', async () => {
    vi.mocked(repo.getTimezoneThrottleState).mockResolvedValue({ tzChangedAt: hoursAgo(25), tzChangeCount: 3 })

    await updateProfile('user-1', { timezone: 'America/New_York' }, NOW)

    expect(repo.updateUserProfile).toHaveBeenCalledWith(
      'user-1',
      { timezone: 'America/New_York' },
      { tzChangedAt: NOW, tzChangeCount: 1 }
    )
  })
})

// ---------------------------------------------------------------------------
// getPublicProfile (Slice 8A)
// ---------------------------------------------------------------------------
const PROFILE_ROW = {
  id: 'target-1',
  username: 'targetuser',
  displayName: 'Target',
  avatarUrl: null,
  bio: 'hi',
  streak: { current: 4, best: 9 },
}

describe('getPublicProfile', () => {
  beforeEach(() => {
    vi.mocked(repo.getUserByUsername).mockResolvedValue(PROFILE_ROW)
    vi.mocked(repo.getFriendCount).mockResolvedValue(3)
    vi.mocked(repo.getVerifiedPostCount).mockResolvedValue(7)
    vi.mocked(friendsService.getRelationshipState).mockResolvedValue('none')
  })

  it('returns identity + counts + relationship for a visible user', async () => {
    const res = await getPublicProfile('viewer-1', 'targetuser')
    expect(res.profile).toMatchObject({
      id: 'target-1',
      username: 'targetuser',
      streak: { current: 4, best: 9 },
      friendCount: 3,
      postCount: 7,
    })
    expect(res.relationship).toBe('none')
  })

  it('throws NotFoundError when the username does not exist', async () => {
    vi.mocked(repo.getUserByUsername).mockResolvedValue(null)
    await expect(getPublicProfile('viewer-1', 'ghost')).rejects.toThrow(NotFoundError)
  })

  it('hides a blocked profile as NotFoundError (no existence leak)', async () => {
    vi.mocked(friendsService.getRelationshipState).mockResolvedValue('blocked')
    await expect(getPublicProfile('viewer-1', 'targetuser')).rejects.toThrow(NotFoundError)
    expect(repo.getFriendCount).not.toHaveBeenCalled() // short-circuits before counts
  })

  it('defaults streak to {current:0,best:0} when the user has no streak row', async () => {
    vi.mocked(repo.getUserByUsername).mockResolvedValue({ ...PROFILE_ROW, streak: null })
    const res = await getPublicProfile('viewer-1', 'targetuser')
    expect(res.profile.streak).toEqual({ current: 0, best: 0 })
  })
})

// ---------------------------------------------------------------------------
// getUserPostsByUsername (Slice 8A) — friends-only grid
// ---------------------------------------------------------------------------
const POST_ROW = (id: string) => ({
  id,
  imageUrl: `https://r2/${id}.jpg`,
  caption: null,
  createdAt: new Date('2024-05-01T00:00:00Z'),
  workout: { type: 'GYM' },
})

describe('getUserPostsByUsername', () => {
  beforeEach(() => {
    vi.mocked(repo.getUserByUsername).mockResolvedValue(PROFILE_ROW)
    vi.mocked(repo.getUserVerifiedPosts).mockResolvedValue([POST_ROW('p1')])
  })

  it('returns posts when the viewer is the owner (no friendship lookup)', async () => {
    const res = await getUserPostsByUsername('target-1', 'targetuser', undefined, 20)
    expect(res.posts).toHaveLength(1)
    expect(res.posts[0]?.id).toBe('p1')
    expect(friendsService.areFriends).not.toHaveBeenCalled()
  })

  it('returns posts when the viewer is an accepted friend', async () => {
    vi.mocked(friendsService.areFriends).mockResolvedValue(true)
    const res = await getUserPostsByUsername('friend-2', 'targetuser', undefined, 20)
    expect(res.posts).toHaveLength(1)
    expect(friendsService.areFriends).toHaveBeenCalledWith('friend-2', 'target-1')
  })

  it('throws ForbiddenError for a non-friend (friends-only grid)', async () => {
    vi.mocked(friendsService.areFriends).mockResolvedValue(false)
    await expect(getUserPostsByUsername('stranger', 'targetuser', undefined, 20)).rejects.toThrow(
      ForbiddenError,
    )
    expect(repo.getUserVerifiedPosts).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the username does not exist', async () => {
    vi.mocked(repo.getUserByUsername).mockResolvedValue(null)
    await expect(getUserPostsByUsername('viewer', 'ghost', undefined, 20)).rejects.toThrow(
      NotFoundError,
    )
  })

  it('emits a nextCursor when there are more rows than the limit', async () => {
    // limit 2 → repo returns 3 (limit+1) → page is 2, nextCursor present
    vi.mocked(repo.getUserVerifiedPosts).mockResolvedValue([POST_ROW('p1'), POST_ROW('p2'), POST_ROW('p3')])
    const res = await getUserPostsByUsername('target-1', 'targetuser', undefined, 2)
    expect(res.posts).toHaveLength(2)
    expect(res.nextCursor).not.toBeNull()
  })

  it('returns nextCursor=null on the last page', async () => {
    vi.mocked(repo.getUserVerifiedPosts).mockResolvedValue([POST_ROW('p1')])
    const res = await getUserPostsByUsername('target-1', 'targetuser', undefined, 20)
    expect(res.nextCursor).toBeNull()
  })
})
