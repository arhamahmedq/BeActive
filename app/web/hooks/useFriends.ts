'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFriends,
  fetchPendingFriends,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  cancelFriendRequest,
  ApiError,
} from '@/lib/api/friends.api'
import type { FriendClient, PendingFriendEntry } from '@/lib/api/friends.api'

export type { FriendClient, PendingFriendEntry }

// ---------------------------------------------------------------------------
// useFriends — single source of truth for all friend state
// ALL friend mutations live here. Components must ONLY call these methods.
// ---------------------------------------------------------------------------

export function useFriends() {
  const queryClient = useQueryClient()

  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: fetchFriends,
    staleTime: 30_000,
    // 409 means already a friend / not pending — treat as stale data, refetch
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 429)) return false
      return failureCount < 2
    },
  })

  const pendingQuery = useQuery({
    queryKey: ['friends', 'pending'],
    queryFn: fetchPendingFriends,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 429) return false
      return failureCount < 2
    },
  })

  // SINGLE CACHE-INVALIDATION CONTRACT (shared with useProfileRelationship):
  // any friendship mutation can change the friends list, the pending lists, feed
  // visibility, and any cached profile (relationship + friend counts on BOTH
  // sides). Invalidate all four namespaces so every surface re-syncs. Note
  // ['friends'] is a prefix that also matches ['friends','pending'].
  const syncSocialGraph = () => {
    void queryClient.invalidateQueries({ queryKey: ['friends'] })
    void queryClient.invalidateQueries({ queryKey: ['feed'] })
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }

  const sendRequestMutation = useMutation({
    mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
    onSuccess: syncSocialGraph,
    onError: (error) => {
      // 409 = duplicate request — reconcile by re-syncing
      if (error instanceof ApiError && error.status === 409) syncSocialGraph()
    },
  })

  const acceptRequestMutation = useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: syncSocialGraph,
    onError: (error) => {
      // Already accepted — reconcile server state
      if (error instanceof ApiError && error.status === 409) syncSocialGraph()
    },
  })

  const rejectRequestMutation = useMutation({
    mutationFn: (friendshipId: string) => rejectFriendRequest(friendshipId),
    onSuccess: syncSocialGraph,
    onError: (error) => {
      // Already gone — reconcile
      if (error instanceof ApiError && error.status === 404) syncSocialGraph()
    },
  })

  const removeFriendMutation = useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    onSuccess: syncSocialGraph,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) syncSocialGraph()
    },
  })

  const cancelRequestMutation = useMutation({
    mutationFn: (friendshipId: string) => cancelFriendRequest(friendshipId),
    onSuccess: syncSocialGraph,
    onError: (error) => {
      // 404 (already gone) or 409 (no longer pending — e.g. just accepted) → reconcile.
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) syncSocialGraph()
    },
  })

  return {
    // Data (always arrays — never undefined in consumers)
    friends: friendsQuery.data?.friends ?? [] as FriendClient[],
    incoming: pendingQuery.data?.incoming ?? [] as PendingFriendEntry[],
    outgoing: pendingQuery.data?.outgoing ?? [] as PendingFriendEntry[],

    // Loading states
    isLoading: friendsQuery.isLoading || pendingQuery.isLoading,
    isFriendsLoading: friendsQuery.isLoading,
    isPendingLoading: pendingQuery.isLoading,
    isError: friendsQuery.isError || pendingQuery.isError,

    // Mutations — components call these, never fetch directly
    sendRequest: sendRequestMutation,
    acceptRequest: acceptRequestMutation,
    rejectRequest: rejectRequestMutation,
    removeFriend: removeFriendMutation,
    cancelRequest: cancelRequestMutation,
  }
}
