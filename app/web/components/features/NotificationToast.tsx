'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useNotificationCount } from '@/hooks/useNotifications'

export function NotificationToast() {
  const { data: unreadCount } = useNotificationCount()
  const prevCountRef = useRef<number | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (unreadCount == null) return

    const prev = prevCountRef.current
    if (prev !== null && unreadCount > prev) {
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 4000)
    }
    prevCountRef.current = unreadCount

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [unreadCount])

  if (!visible) return null

  return (
    <div className="fixed top-20 right-4 z-50 w-72 glass-overlay rounded-2xl px-4 py-3 animate-slide-in-right shadow-lg">
      <Link
        href="/notifications"
        onClick={() => setVisible(false)}
        className="flex items-center gap-3"
      >
        <span className="text-2xl shrink-0" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">New notification</p>
          <p className="text-xs text-gray-500">Tap to see →</p>
        </div>
      </Link>
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
