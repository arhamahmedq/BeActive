'use client'
import { useQuery } from '@tanstack/react-query'

export interface PostStatusResult {
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  workoutType: string | undefined
  confidence: number | undefined
}

export function usePostStatus(postId: string | null, enabled: boolean) {
  return useQuery<PostStatusResult>({
    queryKey: ['post-status', postId],
    queryFn: async (): Promise<PostStatusResult> => {
      if (!postId) throw new Error('postId is required')
      const res = await fetch(`/api/posts/${postId}`)
      if (!res.ok) throw new Error(`Failed to fetch post status: ${res.status}`)
      const { post } = (await res.json()) as {
        post: {
          status: string
          workout?: { type?: string; aiConfidence?: number } | null
        }
      }
      if (!post?.status) throw new Error('Invalid post status response shape')
      return {
        status: post.status as PostStatusResult['status'],
        workoutType: post.workout?.type ?? undefined,
        confidence: post.workout?.aiConfidence ?? undefined,
      }
    },
    enabled: enabled && postId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'VERIFIED' || s === 'REJECTED' ? false : 1500
    },
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  })
}
