'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData, QueryKey } from '@tanstack/react-query'
import { likePost, unlikePost } from '@/lib/api/interactions.api'
import type { FeedResponse, FeedPostResponse } from '@/shared/types/feed'

type FeedCache = InfiniteData<FeedResponse>

// Patch a single post wherever it lives in the (paginated) feed cache.
function patchPostInFeed(
  qc: ReturnType<typeof useQueryClient>,
  postId: string,
  patch: (p: FeedPostResponse) => FeedPostResponse,
) {
  qc.setQueriesData<FeedCache>({ queryKey: ['feed'] }, (old) => {
    if (!old?.pages) return old
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        posts: page.posts.map((post) => (post.id === postId ? patch(post) : post)),
      })),
    }
  })
}

// Optimistic like/unlike toggle. POST or DELETE per current state (no toggle
// endpoint), optimistic flip on the feed cache, reconcile with the server's
// authoritative count on success, rollback on error.
export function useLikeToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      liked ? unlikePost(postId) : likePost(postId),
    onMutate: async ({ postId, liked }) => {
      await qc.cancelQueries({ queryKey: ['feed'] })
      const prev = qc.getQueriesData<FeedCache>({ queryKey: ['feed'] })
      patchPostInFeed(qc, postId, (p) => ({
        ...p,
        likedByMe: !liked,
        likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)),
      }))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]: [QueryKey, FeedCache | undefined]) =>
        qc.setQueryData(key, data),
      )
    },
    onSuccess: (res, { postId }) => {
      patchPostInFeed(qc, postId, (p) => ({ ...p, likedByMe: res.liked, likeCount: res.likeCount }))
    },
  })
}
