'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { useNotificationCount } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function UsersIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function PersonIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

const itemBase = 'group/item flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-150 w-full'
const itemInactive = 'text-gray-500 hover:text-gray-900 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm'

interface SideNavLinkProps {
  href: string
  label: string
  active: boolean
  children: React.ReactNode
  badge?: number
}

function SideNavLink({ href, label, active, children, badge }: SideNavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${itemBase} ${
        active
          ? 'bg-brand-500/10 text-brand-700 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_4px_rgba(34,197,94,0.12)]'
          : itemInactive
      }`}
    >
      <span className="relative flex-shrink-0">
        {children}
        {badge != null && badge > 0 && (
          <span
            className="absolute -top-1 -right-1 w-[7px] h-[7px] bg-red-500 rounded-full border border-white"
            aria-hidden
          />
        )}
      </span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 group-hover:delay-75 whitespace-nowrap text-sm overflow-hidden">
        {label}
      </span>
    </Link>
  )
}

// Helper that maps DisplayTier → plant emoji for sidebar
function getPlantEmoji(current: number): string {
  if (current <= 0) return '🌱'
  if (current < 7)  return '🌿'
  if (current < 30) return '🪴'
  if (current < 100) return '🌲'
  if (current < 200) return '🌳'
  if (current < 365) return '🎄'
  return '🌸'
}

export function DesktopSideNav() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { data: streak } = useStreak()
  const { data: unreadCount } = useNotificationCount()

  const feedActive    = pathname === '/feed' || pathname.startsWith('/p/')
  const friendsActive = pathname === '/friends' || pathname.startsWith('/friends/')
  const notifActive   = pathname === '/notifications'
  const profileActive = user ? pathname === `/u/${user.username}` : false

  return (
    <nav
      className="group hidden lg:flex flex-col fixed left-0 z-30 overflow-hidden
                 w-16 hover:w-[220px]
                 transition-[width] duration-200 ease-out
                 glass-panel border-r border-white/40 border-b-0"
      style={{ top: '57px', bottom: 0 }}
      aria-label="Primary navigation"
    >
      <div className="flex-1 py-4 px-2 space-y-0.5 overflow-hidden">
        <SideNavLink href="/feed" label="Home" active={feedActive}>
          <HomeIcon active={feedActive} />
        </SideNavLink>

        <SideNavLink href="/friends" label="Friends" active={friendsActive}>
          <UsersIcon active={friendsActive} />
        </SideNavLink>

        <SideNavLink href="/notifications" label="Notifications" active={notifActive} badge={unreadCount ?? 0}>
          <BellIcon active={notifActive} />
        </SideNavLink>

        {/* Log Workout — prominent brand CTA */}
        <Link
          href="/upload"
          className={`${itemBase} text-white bg-brand-500 hover:bg-brand-600 font-semibold transition-all duration-150`}
          style={{ boxShadow: '0 2px 12px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)' }}
          aria-label="Log workout"
        >
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            <PlusIcon />
          </span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 group-hover:delay-75 whitespace-nowrap text-sm overflow-hidden">
            Log workout
          </span>
        </Link>

        {/* Profile */}
        {user ? (
          <Link
            href={`/u/${user.username}`}
            aria-current={profileActive ? 'page' : undefined}
            className={`${itemBase} ${
              profileActive
                ? 'bg-brand-500/10 text-brand-700 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_4px_rgba(34,197,94,0.12)]'
                : itemInactive
            }`}
          >
            <span className={`flex-shrink-0 rounded-full ${profileActive ? 'ring-[1.5px] ring-brand-500 ring-offset-1' : ''}`}>
              <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="sm" />
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 group-hover:delay-75 whitespace-nowrap text-sm overflow-hidden flex items-center gap-1.5">
              Profile
              {streak && streak.current > 0 && (
                <span className="text-[11px] leading-none">{getPlantEmoji(streak.current)}</span>
              )}
            </span>
          </Link>
        ) : (
          <SideNavLink href="/login" label="Profile" active={false}>
            <PersonIcon active={false} />
          </SideNavLink>
        )}
      </div>

      {/* Streak quick-peek — shows plant + days in collapsed icon mode */}
      {user && streak && streak.current > 0 && (
        <div className="pb-2 px-2 overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-brand-500/8">
            <span className="text-base leading-none flex-shrink-0 motion-safe:animate-plant-sway">
              {getPlantEmoji(streak.current)}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 group-hover:delay-75 whitespace-nowrap text-xs font-semibold text-brand-700 overflow-hidden">
              {streak.current}-day streak
            </span>
          </div>
        </div>
      )}

      {/* Sign out */}
      {user && (
        <div className="py-4 px-2 border-t border-white/30 overflow-hidden">
          <button
            onClick={signOut}
            className={`${itemBase} text-gray-400 hover:text-gray-700 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm`}
            aria-label="Sign out"
          >
            <LogoutIcon />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 group-hover:delay-75 whitespace-nowrap text-sm overflow-hidden">
              Sign out
            </span>
          </button>
        </div>
      )}
    </nav>
  )
}
