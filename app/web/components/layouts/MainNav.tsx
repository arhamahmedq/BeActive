'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotificationCount } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'

const NAV_LINKS = [
  { href: '/feed', label: 'Feed' },
  { href: '/friends', label: 'Friends' },
] as const

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export function MainNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { data: unreadCount } = useNotificationCount()
  const profileActive = user ? pathname === `/u/${user.username}` : false
  const notifActive = pathname === '/notifications'

  return (
    <nav className="glass-nav sticky top-0 z-40 px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/feed" className="font-bold text-lg hover:opacity-70 transition-opacity">
            BeActive
          </Link>
          <div className="flex items-center gap-4">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`text-sm font-medium transition-colors ${
                    active ? 'text-black' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Log workout — icon-only on mobile, full pill on sm+ */}
          <Link
            href="/upload"
            aria-label="Log workout"
            className="inline-flex items-center justify-center gap-1.5 bg-brand-500 text-white font-medium rounded-full transition-colors hover:bg-brand-600 motion-safe:active:scale-95
              h-9 w-9 text-xl
              sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            <span aria-hidden className="sm:hidden leading-none">+</span>
            <span className="hidden sm:inline">+ Log workout</span>
          </Link>

          {/* Notification bell */}
          <Link
            href="/notifications"
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            aria-current={notifActive ? 'page' : undefined}
            className={`relative p-1.5 rounded-full transition-colors ${
              notifActive ? 'text-black' : 'text-gray-500 hover:text-black'
            }`}
          >
            <BellIcon />
            {unreadCount != null && unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {user && (
            <Link
              href={`/u/${user.username}`}
              aria-label="My profile"
              aria-current={profileActive ? 'page' : undefined}
              className={`rounded-full transition-opacity hover:opacity-80 ${
                profileActive ? 'ring-2 ring-brand-500 ring-offset-1' : ''
              }`}
            >
              <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="md" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
