'use client'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { fetchComments, addComment, deleteComment } from '@/lib/api/interactions.api'
import { ApiError } from '@/lib/api/friends.api'
import type { CommentsResponse } from '@/shared/types/interactions'
import type { FeedResponse } from '@/shared/types/feed'

// Comments list for a post — only fetched when `enabled` (the card is expanded),
// so the feed list stays light.
export function useComments(postId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['comments', postId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => fetchComments(postId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: CommentsResponse) => last.nextCursor ?? undefined,
    enabled: enabled && postId.length > 0,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 429)) return false
      return failureCount < 1
    },
  })
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(postId, commentId),
    onSuccess: (_data, commentId) => {
      // Remove from comments cache.
      qc.setQueryData<InfiniteData<CommentsResponse>>(['comments', postId], (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            comments: page.comments.filter((c) => c.id !== commentId),
          })),
        }
      })
      // Decrement commentCount on the feed card.
      qc.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: ['feed'] }, (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
            ),
          })),
        }
      })
    },
  })
}

export function useAddComment(postId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => addComment(postId, body),
    onSuccess: (comment) => {
      // Prepend to the comments list cache (newest-first).
      qc.setQueryData<InfiniteData<CommentsResponse>>(['comments', postId], (old) => {
        if (!old?.pages?.length) {
          return {
            pages: [{ comments: [comment], nextCursor: null }],
            pageParams: [undefined],
          } as InfiniteData<CommentsResponse>
        }
        const [first, ...rest] = old.pages
        return { ...old, pages: [{ ...first, comments: [comment, ...first.comments] }, ...rest] }
      })
      // Bump the feed post's commentCount so the card count stays in sync.
      qc.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: ['feed'] }, (old) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
            ),
          })),
        }
      })
    },
  })
}
