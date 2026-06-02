import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/users/users.repo')

import { updateProfile } from '../../server/modules/users/users.service'
import * as repo from '../../server/modules/users/users.repo'
import { AppError } from '../../server/core/errors/AppError'

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
