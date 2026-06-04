'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchFriends,
  fetchPendingFriends,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
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

  const sendRequestMutation = useMutation({
    mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
    },
    onError: (error) => {
      // 409 = duplicate request — reconcile by refreshing pending state
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
      }
    },
  })

  const acceptRequestMutation = useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] })
      void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
      void queryClient.invalidateQueries({ queryKey: ['feed'] }) // new friend's posts now visible
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Already accepted — reconcile server state
        void queryClient.invalidateQueries({ queryKey: ['friends'] })
        void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
      }
    },
  })

  const rejectRequestMutation = useMutation({
    mutationFn: (friendshipId: string) => rejectFriendRequest(friendshipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        // Already gone — reconcile
        void queryClient.invalidateQueries({ queryKey: ['friends', 'pending'] })
      }
    },
  })

  const removeFriendMutation = useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] })
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['friends'] })
      }
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
  }
}
