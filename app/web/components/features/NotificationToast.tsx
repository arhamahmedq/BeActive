'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useNotificationCount } from '@/hooks/useNotifications'

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-brand-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

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
    <div className="fixed top-[72px] right-4 z-50 w-72 animate-slide-in-right">
      <div className="bg-white/98 backdrop-blur-[12px] border border-gray-200 rounded-xl px-4 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
        <Link
          href="/notifications"
          onClick={() => setVisible(false)}
          className="flex items-center gap-3"
        >
          <BellIcon />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">New notification</p>
            <p className="text-xs text-gray-500">Tap to see →</p>
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
