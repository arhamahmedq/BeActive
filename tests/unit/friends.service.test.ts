import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/friends/friends.repo')

import { getAcceptedFriendIds } from '../../server/modules/friends/friends.service'
import * as repo from '../../server/modules/friends/friends.repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('friends.service.getAcceptedFriendIds', () => {
  it('delegates to the repository with the correct userId', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue(['friend-1'])

    const result = await getAcceptedFriendIds('user-1')

    expect(repo.getAcceptedFriendIds).toHaveBeenCalledWith('user-1')
    expect(result).toEqual(['friend-1'])
  })

  it('passes through an empty result when there are no accepted friends', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue([])

    const result = await getAcceptedFriendIds('user-1')

    expect(result).toEqual([])
  })

  it('passes through multiple friend ids without transformation', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue(['friend-a', 'friend-b', 'friend-c'])

    const result = await getAcceptedFriendIds('user-1')

    expect(result).toEqual(['friend-a', 'friend-b', 'friend-c'])
  })

  it('calls the repository exactly once per invocation', async () => {
    vi.mocked(repo.getAcceptedFriendIds).mockResolvedValue([])

    await getAcceptedFriendIds('user-1')

    expect(repo.getAcceptedFriendIds).toHaveBeenCalledTimes(1)
  })
})
