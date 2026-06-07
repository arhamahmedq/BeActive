'use client'
import Link from 'next/link'
import { useFriends } from '@/hooks/useFriends'
import { Avatar } from '@/components/ui/Avatar'

export function DesktopRightSidebar() {
  const { friends, isFriendsLoading } = useFriends()

  // Top 5 friends sorted by streak desc
  const topFriends = [...friends]
    .sort((a, b) => b.streak.current - a.streak.current)
    .slice(0, 5)

  return (
    <aside
      className="hidden xl:flex flex-col fixed right-0 z-20 w-64 py-6 px-4 gap-6 overflow-y-auto"
      style={{ top: '60px', bottom: 0 }}
      aria-label="Friends sidebar"
    >
      {/* Top streaks */}
      <section>
        <h2 className="text-eyebrow mb-3">Friends on a streak</h2>

        {isFriendsLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                  <div className="h-2 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isFriendsLoading && topFriends.length === 0 && (
          <p className="text-xs text-gray-400 leading-relaxed">
            Add friends to see their streaks here.{' '}
            <Link href="/friends" className="text-brand-600 hover:underline">Find people →</Link>
          </p>
        )}

        {topFriends.length > 0 && (
          <ul className="space-y-3">
            {topFriends.map((friend, index) => (
              <li key={friend.id}>
                <Link
                  href={`/u/${friend.username}`}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl transition-all duration-150 hover:bg-black/[0.035] hover:ring-1 hover:ring-black/5 -mx-2"
                >
                  {/* Rank indicator */}
                  <span className="text-[10px] font-bold text-gray-300 w-3 text-center tabular-nums flex-shrink-0">
                    {index + 1}
                  </span>
                  <Avatar src={friend.avatarUrl} name={friend.username} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">
                      {friend.displayName ?? `@${friend.username}`}
                    </p>
                    {friend.streak.current > 0 ? (
                      <p className="text-[11px] text-brand-600 font-medium tabular-nums">
                        🔥 {friend.streak.current} days
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400">No streak</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Find friends CTA (only when there are few friends) */}
      {friends.length < 3 && !isFriendsLoading && (
        <section>
          <h2 className="text-eyebrow mb-3">Grow your network</h2>
          <Link
            href="/friends"
            className="block w-full text-center py-2.5 rounded-xl text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors"
          >
            Find friends →
          </Link>
        </section>
      )}
    </aside>
  )
}
