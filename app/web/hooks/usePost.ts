'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchPost } from '@/lib/api/posts.api'
import { ApiError } from '@/lib/api/friends.api'

// Single post (read-only). Visibility is enforced server-side (friends-only) —
// a non-viewer gets 404, which we surface as "not found".
export function usePost(postId: string) {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: () => fetchPost(postId),
    enabled: postId.length > 0,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 429)) return false
      return failureCount < 1
    },
  })
}
