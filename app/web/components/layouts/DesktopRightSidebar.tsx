'use client'
import Link from 'next/link'
import { useFriends } from '@/hooks/useFriends'
import { Avatar } from '@/components/ui/Avatar'

function getPlantEmoji(days: number): string {
  if (days <= 0) return ''
  if (days < 7)   return '🌿'
  if (days < 30)  return '🪴'
  if (days < 100) return '🌲'
  if (days < 200) return '🌳'
  if (days < 365) return '🎄'
  return '🌸'
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 flex-shrink-0 text-brand-500" fill="currentColor" aria-hidden>
      <path d="M8 1C8 1 4 5 4 9a4 4 0 008 0c0-2.5-1.5-4.5-1.5-4.5S9.5 6 9.5 7.5a1.5 1.5 0 01-3 0C6.5 5.5 8 1 8 1z" />
    </svg>
  )
}

export function DesktopRightSidebar() {
  const { friends, isFriendsLoading } = useFriends()

  const topFriends = [...friends]
    .sort((a, b) => b.streak.current - a.streak.current)
    .slice(0, 5)

  return (
    <aside
      className="hidden xl:flex flex-col fixed right-0 z-20 w-64 py-5 px-3 gap-4 overflow-y-auto"
      style={{ top: '57px', bottom: 0 }}
      aria-label="Friends sidebar"
    >
      {/* Top streaks section */}
      <section>
        <h2 className="text-eyebrow mb-3 px-1">Friends on a streak</h2>

        {/* Loading skeleton */}
        {isFriendsLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card rounded-2xl px-3 py-2.5 flex items-center gap-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200/80 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-gray-200/80 rounded w-2/3" />
                  <div className="h-2 bg-gray-200/80 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty — no friends yet */}
        {!isFriendsLoading && topFriends.length === 0 && (
          <div className="glass-card rounded-2xl px-4 py-4 text-center space-y-2">
            <p className="text-2xl" aria-hidden>🌱</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Add friends to see their streaks and plants here.
            </p>
            <Link
              href="/friends"
              className="inline-block text-[11px] font-semibold text-brand-700 hover:text-brand-800 mt-1"
            >
              Find friends →
            </Link>
          </div>
        )}

        {/* Friend streak leaderboard */}
        {topFriends.length > 0 && (
          <ol className="space-y-1.5">
            {topFriends.map((friend, index) => {
              const plant = getPlantEmoji(friend.streak.current)
              return (
                <li key={friend.id}>
                  <Link
                    href={`/u/${friend.username}`}
                    className="group/row glass-card rounded-2xl flex items-center gap-2.5 px-3 py-2.5 transition-all duration-150 hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] hover:-translate-y-[1px]"
                  >
                    {/* Rank */}
                    <span className="text-[10px] font-bold text-gray-300 w-3 text-center tabular-nums flex-shrink-0">
                      {index + 1}
                    </span>

                    {/* Avatar */}
                    <span className="flex-shrink-0 relative">
                      <Avatar src={friend.avatarUrl} name={friend.username} size="sm" />
                      {/* Online / posted-today dot — shows plant emoji on hover */}
                      {friend.streak.current > 0 && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 text-[9px] leading-none"
                          aria-hidden
                          title={`Streak plant: ${plant}`}
                        >
                          {plant}
                        </span>
                      )}
                    </span>

                    {/* Name + streak */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-gray-900 truncate leading-tight">
                        {friend.displayName ?? `@${friend.username}`}
                      </p>
                      {friend.streak.current > 0 ? (
                        <p className="flex items-center gap-1 text-[11px] text-brand-600 font-medium tabular-nums">
                          <FlameIcon />
                          {friend.streak.current} days
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-400">No streak</p>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Grow network CTA */}
      {friends.length < 3 && !isFriendsLoading && (
        <section>
          <h2 className="text-eyebrow mb-3 px-1">Grow your network</h2>
          <Link
            href="/friends"
            className="block w-full text-center py-2.5 rounded-2xl text-xs font-semibold text-brand-700 transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #bbf7d0',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            Find friends →
          </Link>
        </section>
      )}
    </aside>
  )
}
