'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useNotifications, useMarkAllRead, useNotificationCount } from '@/hooks/useNotifications'
import { NotificationItem } from '@/components/features/NotificationItem'

export default function NotificationsPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useNotifications()
  const { data: unreadCount } = useNotificationCount()
  const { mutate: markAllRead } = useMarkAllRead()
  const markedRef = useRef(false)

  // Mark all as read once on open, only if there are unread notifications.
  useEffect(() => {
    if (!markedRef.current && unreadCount != null && unreadCount > 0) {
      markedRef.current = true
      markAllRead()
    }
  }, [unreadCount, markAllRead])

  const sentinelRef = useRef<HTMLDivElement>(null)
  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

  const allNotifications = data?.pages.flatMap((p) => p.notifications) ?? []

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h1 className="font-semibold text-base">Notifications</h1>
      </div>

      {status === 'pending' && (
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <p className="px-4 py-8 text-sm text-gray-500 text-center">
          Failed to load notifications. Try refreshing.
        </p>
      )}

      {status === 'success' && allNotifications.length === 0 && (
        <p className="px-4 py-12 text-sm text-gray-400 text-center">
          No notifications yet. Post a workout to get started.
        </p>
      )}

      {status === 'success' && allNotifications.length > 0 && (
        <div>
          {allNotifications.map((n) => (
            <NotificationItem key={n.id} notification={n} />
          ))}
          {isFetchingNextPage && (
            <div className="px-4 py-3 text-sm text-gray-400 text-center animate-pulse">
              Loading more…
            </div>
          )}
          {!hasNextPage && allNotifications.length > 5 && (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">
              You&apos;re all caught up
            </p>
          )}
        </div>
      )}

      <div ref={sentinelRef} />
    </div>
  )
}
