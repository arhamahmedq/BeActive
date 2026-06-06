'use client'
import type { NotificationItem as NotificationItemType } from '@/shared/types/notifications'

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

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

interface Props {
  notification: NotificationItemType
}

export function NotificationItem({ notification }: Props) {
  const icon = TYPE_ICONS[notification.type] ?? '🔔'

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0 ${
        notification.read ? 'bg-white' : 'bg-blue-50'
      }`}
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
        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" aria-hidden />
      )}
    </div>
  )
}
