'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotificationCount } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'

function HomeIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function UsersIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

interface TabProps {
  href: string
  label: string
  active: boolean
  children: React.ReactNode
  badge?: boolean
}

function Tab({ href, label, active, children, badge }: TabProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center gap-[3px] min-w-[52px] px-2.5 py-2 rounded-2xl transition-all duration-150 active:scale-90 ${
        active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Active indicator — small dot below icon */}
      {active && (
        <span
          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500 animate-spring-in"
          aria-hidden
        />
      )}
      <span className="relative">
        {children}
        {badge && (
          <span
            className="absolute -top-0.5 -right-1 w-[7px] h-[7px] bg-red-500 rounded-full border border-white animate-badge-bounce"
            aria-hidden
          />
        )}
      </span>
      <span className={`text-[10px] font-semibold leading-none tracking-tight ${active ? 'text-brand-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </Link>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { data: unreadCount } = useNotificationCount()

  const feedActive    = pathname === '/feed' || pathname.startsWith('/feed/') || pathname.startsWith('/p/')
  const friendsActive = pathname === '/friends' || pathname.startsWith('/friends/')
  const notifActive   = pathname === '/notifications'
  const profileActive = user ? pathname === `/u/${user.username}` : false

  return (
    /* Outer wrapper — provides the bottom clearance zone */
    <div
      className="lg:hidden fixed left-0 right-0 z-40 flex justify-center animate-slide-up-dock"
      style={{ bottom: `calc(16px + env(safe-area-inset-bottom))` }}
      aria-label="Mobile navigation"
    >
      {/* Floating glass pill dock — iOS 26 pattern */}
      <nav
        className="glass-dock rounded-[36px] flex items-center px-2 py-1"
        role="navigation"
        aria-label="Primary navigation"
      >
        <Tab href="/feed" label="Feed" active={feedActive}>
          <HomeIcon filled={feedActive} />
        </Tab>

        <Tab href="/friends" label="Friends" active={friendsActive}>
          <UsersIcon filled={friendsActive} />
        </Tab>

        {/* Upload FAB — elevated center action */}
        <Link
          href="/upload"
          aria-label="Log workout"
          className="relative overflow-hidden flex items-center justify-center mx-1.5 w-[50px] h-[50px] rounded-full glass-fab text-brand-700
                     active:scale-90 transition-all duration-150 -mt-1"
          style={{
            boxShadow: '0 6px 20px rgba(34,197,94,0.35), 0 2px 8px rgba(34,197,94,0.2)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* Ambient sheen — slow diagonal shimmer drifting across the glass */}
          <span className="absolute inset-0 glass-fab-sheen motion-safe:animate-glass-sheen-drift" aria-hidden />
          <span className="relative z-10">
            <PlusIcon />
          </span>
        </Link>

        <Tab
          href="/notifications"
          label="Activity"
          active={notifActive}
          badge={unreadCount != null && unreadCount > 0}
        >
          <BellIcon filled={notifActive} />
        </Tab>

        {/* Profile tab */}
        {user ? (
          <Link
            href={`/u/${user.username}`}
            aria-current={profileActive ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-[3px] min-w-[52px] px-2.5 py-2 rounded-2xl transition-all duration-150 active:scale-90 ${
              profileActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {profileActive && (
              <span
                className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500 animate-spring-in"
                aria-hidden
              />
            )}
            <span
              className={`inline-flex items-center justify-center w-[23px] h-[23px] rounded-full overflow-hidden transition-all duration-150 ${
                profileActive ? 'ring-[1.5px] ring-brand-500 ring-offset-[1.5px]' : ''
              }`}
            >
              <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="xs" />
            </span>
            <span className={`text-[10px] font-semibold leading-none tracking-tight ${profileActive ? 'text-brand-600' : 'text-gray-400'}`}>
              You
            </span>
          </Link>
        ) : (
          <Tab href="/login" label="You" active={false}>
            <span className="w-[22px] h-[22px] rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-500">?</span>
          </Tab>
        )}
      </nav>
    </div>
  )
}
