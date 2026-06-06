'use client'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchNotifications,
  markNotificationsRead,
} from '@/lib/api/notifications.api'

// Lightweight hook used by the nav bell badge — fetches only the first page
// to get an accurate unreadCount. Refetches every 60s and on window focus.
export function useNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const data = await fetchNotifications(undefined, 1)
      return data.unreadCount
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

// Full paginated list for the notifications page.
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam }) =>
      fetchNotifications(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  })
}

// Mark all as read — invalidates both cache entries.
export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => markNotificationsRead(undefined, true),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
