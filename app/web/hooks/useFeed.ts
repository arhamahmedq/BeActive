'use client'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { FeedResponse } from '@/shared/types/feed'

export function useFeed() {
  return useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const params = new URLSearchParams({ limit: '20' })
      if (pageParam) params.set('cursor', pageParam)
      const res = await fetch(`/api/feed?${params}`)
      if (!res.ok) throw new Error(`Failed to load feed: ${res.status}`)
      return res.json() as Promise<FeedResponse>
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: FeedResponse) => lastPage.nextCursor ?? undefined,
    staleTime: 60_000,
    retry: 1,
  })
}
