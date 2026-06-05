'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from '@/lib/api/friends.api'
import type { PublicProfileResponse } from '@/shared/types/profile'

// All friendship mutations for the profile page, with optimistic updates of the
// cached relationship and a server re-sync on settle. Reuses the existing
// friends.api endpoints (request / accept / reject=decline / cancel / remove) —
// no new backend. Mutual consistency is the backend's job (one Friendship row);
// here we just invalidate ['friends'] and ['feed'] so every surface re-syncs.
export function useProfileRelationship(username: string) {
  const qc = useQueryClient()
  const key = ['profile', username] as const

  function patchCache(patch: (prev: PublicProfileResponse) => PublicProfileResponse) {
    const prev = qc.getQueryData<PublicProfileResponse>(key)
    if (prev) qc.setQueryData<PublicProfileResponse>(key, patch(prev))
    return prev
  }

  // Shared optimistic lifecycle: snapshot → optimistic patch → rollback on error
  // → invalidate profile/friends/feed on settle.
  function lifecycle(optimistic: (prev: PublicProfileResponse) => PublicProfileResponse) {
    return {
      onMutate: async () => {
        await qc.cancelQueries({ queryKey: key })
        const prev = patchCache(optimistic)
        return { prev }
      },
      onError: (_e: unknown, _v: unknown, ctx: { prev?: PublicProfileResponse } | undefined) => {
        if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: key })
        void qc.invalidateQueries({ queryKey: ['friends'] })
        void qc.invalidateQueries({ queryKey: ['feed'] })
      },
    }
  }

  const add = useMutation({
    mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
    ...lifecycle((prev) => ({ ...prev, relationship: 'outgoing' })),
    onSuccess: (data) => {
      // Capture the real friendship id so Cancel works before the refetch lands.
      patchCache((prev) => ({ ...prev, relationship: 'outgoing', friendshipId: data.friendship.id }))
    },
  })

  const accept = useMutation({
    // friendshipId persists across PENDING→ACCEPTED, so keep it.
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    ...lifecycle((prev) => ({ ...prev, relationship: 'friends' })),
  })

  const decline = useMutation({
    mutationFn: (friendshipId: string) => rejectFriendRequest(friendshipId),
    ...lifecycle((prev) => ({ ...prev, relationship: 'none', friendshipId: null })),
  })

  const cancel = useMutation({
    mutationFn: (friendshipId: string) => cancelFriendRequest(friendshipId),
    ...lifecycle((prev) => ({ ...prev, relationship: 'none', friendshipId: null })),
  })

  const remove = useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    ...lifecycle((prev) => ({ ...prev, relationship: 'none', friendshipId: null })),
  })

  return { add, accept, decline, cancel, remove }
}
