'use client'
import Link from 'next/link'
import type { FriendClient } from '@/hooks/useFriends'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'

interface FriendCardProps {
  friend: FriendClient
  onRemove: (friendshipId: string) => void
  isRemoving: boolean
}

export function FriendCard({ friend, onRemove, isRemoving }: FriendCardProps) {
  const displayName = friend.displayName ?? `@${friend.username}`
  const hasStreak = friend.streak.current > 0

  return (
    <div className="glass-card rounded-2xl flex items-center justify-between py-3 px-4">
      <Link
        href={`/u/${friend.username}`}
        className="flex items-center gap-3 min-w-0 py-1 px-1.5 rounded-xl transition-all duration-150 hover:bg-black/[0.035] hover:ring-1 hover:ring-black/5"
      >
        <Avatar src={friend.avatarUrl} name={friend.username} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-none truncate">{displayName}</p>
          {friend.displayName && (
            <p className="text-xs text-gray-400 mt-0.5">@{friend.username}</p>
          )}
          <div className="mt-1.5">
            {hasStreak ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full tabular-nums">
                <span aria-hidden>🔥</span>
                {friend.streak.current} day streak
              </span>
            ) : (
              <span className="text-xs text-gray-400">No active streak</span>
            )}
          </div>
        </div>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(friend.friendshipId)}
        isLoading={isRemoving}
        className="text-xs text-gray-400 hover:text-red-500 ml-2 flex-shrink-0"
      >
        Remove
      </Button>
    </div>
  )
}
