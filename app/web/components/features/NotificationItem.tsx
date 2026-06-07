'use client'
import Link from 'next/link'
import type { NotificationItem as NotificationItemType } from '@/shared/types/notifications'
import { formatRelativeTime } from '@/lib/formatters'

const TYPE_ICONS: Record<string, string> = {
  WELCOME: '👋',
  FRIEND_REQUEST: '🤝',
  FRIEND_ACCEPTED: '✅',
  WORKOUT_VERIFIED: '💪',
  WORKOUT_REJECTED: '❌',
  FRIEND_POSTED: '🏋️',
  STREAK_AT_RISK: '⚠️',
  STREAK_BROKEN: '💔',
}

function getHref(notification: NotificationItemType): string | null {
  const { type, data } = notification
  const postId = data?.postId as string | undefined
  const username = data?.username as string | undefined

  switch (type) {
    case 'WORKOUT_VERIFIED':
    case 'WORKOUT_REJECTED':
      return postId ? `/p/${postId}` : '/feed'
    case 'FRIEND_POSTED':
      return postId ? `/p/${postId}` : '/feed'
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED':
      return username ? `/u/${username}` : '/friends'
    case 'STREAK_AT_RISK':
    case 'STREAK_BROKEN':
      return '/feed'
    case 'WELCOME':
    default:
      return null
  }
}

interface Props {
  notification: NotificationItemType
}

export function NotificationItem({ notification }: Props) {
  const icon = TYPE_ICONS[notification.type] ?? '🔔'
  const href = getHref(notification)

  const content = (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0 transition-colors ${
        notification.read ? 'bg-white/40' : 'bg-brand-50/60'
      } ${href ? 'hover:bg-white/70 cursor-pointer' : ''}`}
    >
      <span className="text-xl mt-0.5 shrink-0" aria-hidden>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${notification.read ? 'text-gray-700' : 'font-medium text-gray-900'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-gray-500 mt-0.5">{notification.body}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-2" aria-hidden />
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    )
  }

  return content
}
