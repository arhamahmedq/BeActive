'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useNotificationCount, useLatestNotification } from '@/hooks/useNotifications'

const TYPE_STYLE: Record<string, { iconBg: string; iconColor: string; emoji: string }> = {
  WELCOME:          { iconBg: 'bg-gray-100',   iconColor: 'text-gray-500',   emoji: '👋' },
  FRIEND_REQUEST:   { iconBg: 'bg-brand-50',   iconColor: 'text-brand-600',  emoji: '👤' },
  FRIEND_ACCEPTED:  { iconBg: 'bg-brand-50',   iconColor: 'text-brand-600',  emoji: '✓' },
  WORKOUT_VERIFIED: { iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',emoji: '✓' },
  WORKOUT_REJECTED: { iconBg: 'bg-red-50',     iconColor: 'text-red-500',    emoji: '✗' },
  FRIEND_POSTED:    { iconBg: 'bg-brand-50',   iconColor: 'text-brand-600',  emoji: '🔥' },
  STREAK_AT_RISK:   { iconBg: 'bg-amber-50',   iconColor: 'text-amber-600',  emoji: '⚠' },
  STREAK_BROKEN:    { iconBg: 'bg-red-50',     iconColor: 'text-red-500',    emoji: '💔' },
}

export function NotificationToast() {
  const { data: unreadCount } = useNotificationCount()
  const { data: latest } = useLatestNotification()
  const prevCountRef = useRef<number | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (unreadCount == null) return
    const prev = prevCountRef.current
    if (prev !== null && unreadCount > prev) {
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 5000)
    }
    prevCountRef.current = unreadCount
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [unreadCount])

  if (!visible) return null

  const typeStyle = (latest?.type ? TYPE_STYLE[latest.type] : null) ?? { iconBg: 'bg-brand-50', iconColor: 'text-brand-600', emoji: '🔔' }

  return (
    <div className="fixed top-[72px] right-4 z-50 w-80 animate-slide-in-right">
      <div
        className="bg-white rounded-2xl px-4 py-3.5"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}
      >
        <Link
          href="/notifications"
          onClick={() => setVisible(false)}
          className="flex items-center gap-3"
        >
          {/* Type-specific icon circle */}
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${typeStyle.iconBg} ${typeStyle.iconColor}`} aria-hidden>
            {typeStyle.emoji}
          </span>

          {/* Real notification content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {latest?.title ?? 'New notification'}
            </p>
            {latest?.body && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{latest.body}</p>
            )}
          </div>
        </Link>

        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-gray-700 transition-colors rounded-md hover:bg-black/5"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
