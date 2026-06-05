'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'

// Primary authenticated destinations. Logo also routes to /feed (brand-home);
// these are the explicit tabs. Kept tiny — top-bar nav is the only nav paradigm
// today (web-first; a bottom tab bar is a deliberate later redesign).
const NAV_LINKS = [
  { href: '/feed', label: 'Feed' },
  { href: '/friends', label: 'Friends' },
] as const

export function MainNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const profileActive = user ? pathname === `/u/${user.username}` : false
  return (
    <nav className="bg-white border-b border-gray-100 px-4 py-3">
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
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <span aria-hidden>+</span>
            Log workout
          </Link>
          {user && (
            <Link
              href={`/u/${user.username}`}
              aria-label="My profile"
              aria-current={profileActive ? 'page' : undefined}
              className={`rounded-full transition-opacity hover:opacity-80 ${
                profileActive ? 'ring-2 ring-black ring-offset-1' : ''
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
