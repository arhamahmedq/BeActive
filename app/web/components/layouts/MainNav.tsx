'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Primary authenticated destinations. Logo also routes to /feed (brand-home);
// these are the explicit tabs. Kept tiny — top-bar nav is the only nav paradigm
// today (web-first; a bottom tab bar is a deliberate later redesign).
const NAV_LINKS = [
  { href: '/feed', label: 'Feed' },
  { href: '/friends', label: 'Friends' },
] as const

export function MainNav() {
  const pathname = usePathname()
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
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          <span aria-hidden>+</span>
          Log workout
        </Link>
      </div>
    </nav>
  )
}
