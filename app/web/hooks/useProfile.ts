'use client'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { fetchProfile, fetchProfilePosts } from '@/lib/api/profile.api'
import { ApiError } from '@/lib/api/friends.api'
import type { ProfilePostsResponse } from '@/shared/types/profile'

// Profile identity (header). Components MUST go through this hook, not the api.
export function useProfile(username: string) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: () => fetchProfile(username),
    enabled: username.length > 0,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // 404 (no such/hidden user) and 429 are terminal — don't hammer.
      if (error instanceof ApiError && (error.status === 404 || error.status === 429)) return false
      return failureCount < 1
    },
  })
}

// Friends-only posts grid. `enabled` is driven by the relationship (self/friends)
// so we never fire a request we know will 403.
export function useProfilePosts(username: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['profile', username, 'posts'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchProfilePosts(username, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: ProfilePostsResponse) => lastPage.nextCursor ?? undefined,
    enabled: enabled && username.length > 0,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 429)) return false
      return failureCount < 1
    },
  })
}
