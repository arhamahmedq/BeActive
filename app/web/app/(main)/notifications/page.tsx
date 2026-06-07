'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNotifications, useMarkAllRead, useNotificationCount } from '@/hooks/useNotifications'
import { NotificationItem } from '@/components/features/NotificationItem'
import type { NotificationItem as NotificationItemType } from '@/shared/types/notifications'

type NotifFilter = 'all' | 'follows' | 'people' | 'comments'
type DateGroup = 'Today' | 'This week' | 'This month' | 'Older'

const FILTER_LABELS: Record<NotifFilter, string> = {
  all: 'All',
  follows: 'Follows',
  people: 'People',
  comments: 'Comments',
}

const FILTER_TYPES: Record<NotifFilter, string[] | null> = {
  all: null,
  people: ['FRIEND_POSTED', 'WORKOUT_VERIFIED', 'WORKOUT_REJECTED', 'STREAK_AT_RISK', 'STREAK_BROKEN'],
  comments: [],
  follows: ['FRIEND_REQUEST', 'FRIEND_ACCEPTED'],
}

const GROUP_ORDER: DateGroup[] = ['Today', 'This week', 'This month', 'Older']

function getDateGroup(isoStr: string): DateGroup {
  const now = new Date()
  const date = new Date(isoStr)
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return 'Today'
  if (diffDays < 7) return 'This week'
  if (diffDays < 30) return 'This month'
  return 'Older'
}

function groupNotifications(
  items: NotificationItemType[]
): Array<{ group: DateGroup; items: NotificationItemType[] }> {
  const map = new Map<DateGroup, NotificationItemType[]>()
  for (const n of items) {
    const g = getDateGroup(n.createdAt)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(n)
  }
  return GROUP_ORDER.filter(g => map.has(g)).map(g => ({ group: g, items: map.get(g)! }))
}

export default function NotificationsPage() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useNotifications()
  const { data: unreadCount } = useNotificationCount()
  const { mutate: markAllRead } = useMarkAllRead()
  const markedRef = useRef(false)
  const [activeFilter, setActiveFilter] = useState<NotifFilter>('all')

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

  const allNotifications = data?.pages.flatMap(p => p.notifications) ?? []

  const filtered = allNotifications.filter(n => {
    const allowed = FILTER_TYPES[activeFilter]
    if (allowed === null) return true
    return allowed.includes(n.type)
  })

  const groups = groupNotifications(filtered)

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="font-semibold text-base">Notifications</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
        {(Object.keys(FILTER_LABELS) as NotifFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeFilter === f
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100" />

      {/* Loading skeleton */}
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

      {status === 'success' && filtered.length === 0 && (
        <p className="px-4 py-12 text-sm text-gray-400 text-center">
          No notifications yet.
        </p>
      )}

      {status === 'success' && filtered.length > 0 && (
        <div>
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {group}
              </p>
              {items.map(n => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
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
