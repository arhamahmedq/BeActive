'use client'
import Link from 'next/link'
import type { NotificationItem as NotificationItemType } from '@/shared/types/notifications'
import { formatRelativeTime } from '@/lib/formatters'

// ── SVG icon set (stroke-only, 20×20 viewBox, 1.75 stroke) ──────────────────
function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M3 18a7 7 0 0 1 14 0" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 10 8 14 16 6" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 5l10 10M15 5l-10 10" />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 3L2 17h16L10 3z" />
      <line x1="10" y1="10" x2="10" y2="13" strokeWidth="2" />
      <circle cx="10" cy="15.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2c0 4-4 5-4 9a4 4 0 0 0 8 0c0-4-4-8-4-9z" />
      <path d="M9 13a2 2 0 0 0 4 0c0-2-2-4-2-5-1 2-2 3-2 5z" />
    </svg>
  )
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 12c2-1 4-1 6 0" />
      <path d="M5 9c3-2 7-2 10 0" />
      <path d="M3 6c4-3 10-3 14 0" />
    </svg>
  )
}

interface TypeStyle {
  iconBg: string
  iconColor: string
  Icon: React.ComponentType
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  WELCOME:          { iconBg: 'bg-gray-100',    iconColor: 'text-gray-500',   Icon: WaveIcon },
  FRIEND_REQUEST:   { iconBg: 'bg-brand-50',    iconColor: 'text-brand-600',  Icon: PersonIcon },
  FRIEND_ACCEPTED:  { iconBg: 'bg-brand-50',    iconColor: 'text-brand-600',  Icon: CheckIcon },
  WORKOUT_VERIFIED: { iconBg: 'bg-[#eef3e8]',   iconColor: 'text-[#4f7a3c]',  Icon: CheckIcon },
  WORKOUT_REJECTED: { iconBg: 'bg-red-50',      iconColor: 'text-red-500',    Icon: XIcon },
  FRIEND_POSTED:    { iconBg: 'bg-brand-50',    iconColor: 'text-brand-600',  Icon: PersonIcon },
  STREAK_AT_RISK:   { iconBg: 'bg-amber-50',    iconColor: 'text-amber-600',  Icon: WarningIcon },
  STREAK_BROKEN:    { iconBg: 'bg-red-50',      iconColor: 'text-red-500',    Icon: FlameIcon },
}

function getHref(notification: NotificationItemType): string | null {
  const { type, data } = notification
  const postId   = data?.postId   as string | undefined
  const username = data?.username as string | undefined

  switch (type) {
    case 'WORKOUT_VERIFIED':
    case 'WORKOUT_REJECTED':
    case 'FRIEND_POSTED':
      return postId ? `/p/${postId}` : '/feed'
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED':
      return username ? `/u/${username}` : '/friends'
    case 'STREAK_AT_RISK':
      return '/upload'
    case 'STREAK_BROKEN':
      return '/feed'
    default:
      return null
  }
}

interface Props {
  notification: NotificationItemType
}

export function NotificationItem({ notification }: Props) {
  const style = TYPE_STYLES[notification.type] ?? { iconBg: 'bg-gray-100', iconColor: 'text-gray-500', Icon: WaveIcon }
  const { Icon } = style
  const href = getHref(notification)

  const inner = (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        notification.read ? '' : 'bg-brand-50/50'
      } ${href ? 'hover:bg-white/80 cursor-pointer' : ''}`}
    >
      {/* Icon circle — Instagram-style avatar placeholder */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${style.iconBg} ${style.iconColor}`}>
        <Icon />
      </div>

      {/* Inline text: title + timestamp on same line (Instagram pattern) */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 leading-snug">
          <span className={notification.read ? 'font-normal' : 'font-medium'}>
            {notification.title}
          </span>
          {notification.body && (
            <span className="text-gray-500 font-normal"> — {notification.body}</span>
          )}
          {' '}
          <span className="text-[11px] text-gray-400 font-normal whitespace-nowrap">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </p>
      </div>

      {/* Unread dot */}
      {!notification.read && (
        <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" aria-hidden />
      )}
    </div>
  )

  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}
