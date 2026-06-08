'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotificationCount } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'

const NAV_LINKS = [
  { href: '/feed',    label: 'Feed' },
  { href: '/friends', label: 'Friends' },
] as const

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function MainNav() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { data: unreadCount } = useNotificationCount()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const notifActive   = pathname === '/notifications'
  const profileActive = user ? pathname === `/u/${user.username}` : false

  return (
    <nav className="glass-nav sticky top-0 z-40 px-4 py-2.5">
      <div className="max-w-2xl mx-auto flex items-center justify-between lg:max-w-none lg:px-4">
        {/* Left: wordmark + nav links */}
        <div className="flex items-center gap-5">
          <Link href="/feed" className="flex items-center gap-2 hover:opacity-85 transition-opacity">
            {/* Brand icon square */}
            <span
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-500 text-white flex-shrink-0"
              style={{ boxShadow: '0 2px 8px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.3)' }}
              aria-hidden
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden>
                <polygon points="6,2 6,7 2,7 10,14 10,9 14,9" />
              </svg>
            </span>
            <span className="font-bold text-[16px] tracking-tight text-gray-900">BeActive</span>
          </Link>

          {/* Nav links — hidden on mobile (MobileNav handles it) and lg+ (DesktopSideNav handles it) */}
          <div className="hidden sm:flex lg:hidden items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative px-3 py-2 text-sm font-medium rounded-xl transition-all duration-150 ${
                    active
                      ? 'text-gray-900 bg-white/60 backdrop-blur-sm shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-brand-500" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Right: CTA + bell + avatar menu */}
        <div className="flex items-center gap-2">
          {/* Log workout — icon on mobile, pill on sm+, hidden on lg+ (side nav has it) */}
          <Link
            href="/upload"
            aria-label="Log workout"
            className="inline-flex items-center justify-center gap-1.5 bg-brand-500 text-white font-semibold rounded-full transition-all duration-150
              hover:bg-brand-600 hover:shadow-[0_4px_16px_rgba(34,197,94,0.45)] active:scale-95
              shadow-[0_2px_8px_rgba(34,197,94,0.3)]
              h-9 w-9 text-xl sm:h-auto sm:w-auto sm:px-4 sm:py-2 sm:text-sm"
          >
            <span aria-hidden className="sm:hidden leading-none text-lg">+</span>
            <span className="hidden sm:inline">+ Log workout</span>
          </Link>

          {/* Notification bell */}
          <Link
            href="/notifications"
            aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
            aria-current={notifActive ? 'page' : undefined}
            className={`relative p-2 rounded-xl transition-all duration-150 ${
              notifActive
                ? 'text-gray-900 bg-white/60 backdrop-blur-sm shadow-sm'
                : 'text-gray-500 hover:text-gray-900 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm'
            }`}
          >
            <BellIcon />
            {unreadCount != null && unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* Avatar + user dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
                className={`flex items-center gap-1 p-1 rounded-xl transition-all duration-150 ${
                  profileActive
                    ? 'bg-white/60 backdrop-blur-sm shadow-sm ring-2 ring-brand-500 ring-offset-1'
                    : 'hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm'
                }`}
              >
                <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="md" />
                <ChevronDownIcon />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden />
                  <div
                    className="absolute right-0 top-11 z-20 w-52 glass-overlay rounded-2xl py-1.5 animate-spring-in overflow-hidden"
                  >
                    <p className="px-4 py-2 text-xs font-medium text-gray-400 truncate">@{user.username}</p>
                    <div className="border-t border-gray-100 my-1" />
                    <Link
                      href={`/u/${user.username}`}
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      View profile
                    </Link>
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut() }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
