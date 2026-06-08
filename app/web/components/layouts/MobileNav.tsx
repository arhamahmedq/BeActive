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
      className={`flex flex-col items-center gap-0.5 min-w-[48px] px-3 py-1.5 rounded-2xl transition-all duration-150 relative ${
        active
          ? 'text-brand-600 bg-brand-500/10'
          : 'text-gray-400 hover:text-gray-700'
      }`}
    >
      <span className="relative">
        {children}
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" aria-hidden />
        )}
      </span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
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
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-gray-100/60 flex items-center justify-around pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 px-2"
      aria-label="Mobile navigation"
    >
      <Tab href="/feed" label="Feed" active={feedActive}>
        <HomeIcon filled={feedActive} />
      </Tab>

      <Tab href="/friends" label="Friends" active={friendsActive}>
        <UsersIcon filled={friendsActive} />
      </Tab>

      {/* Log workout FAB */}
      <Link
        href="/upload"
        aria-label="Log workout"
        className="flex items-center justify-center w-12 h-12 rounded-full bg-brand-500 text-white hover:bg-brand-600 active:scale-95 transition-all -mt-2"
        style={{ boxShadow: '0 4px 14px rgba(34,197,94,0.45)' }}
      >
        <PlusIcon />
      </Link>

      <Tab href="/notifications" label="Activity" active={notifActive} badge={unreadCount != null && unreadCount > 0}>
        <BellIcon filled={notifActive} />
      </Tab>

      {/* Profile */}
      {user ? (
        <Link
          href={`/u/${user.username}`}
          aria-current={profileActive ? 'page' : undefined}
          className={`flex flex-col items-center gap-0.5 min-w-[48px] px-3 py-1.5 rounded-2xl transition-all duration-150 ${
            profileActive ? 'text-brand-600 bg-brand-500/10' : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full overflow-hidden ${profileActive ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`}>
            <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="xs" />
          </span>
          <span className="text-[10px] font-medium leading-none">You</span>
        </Link>
      ) : (
        <Tab href="/login" label="You" active={false}>
          <span className="w-[22px] h-[22px] rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-500">?</span>
        </Tab>
      )}
    </nav>
  )
}
