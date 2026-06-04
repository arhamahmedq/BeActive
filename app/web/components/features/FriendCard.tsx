'use client'
import type { FriendClient } from '@/hooks/useFriends'
import { Button } from '@/components/ui/Button'

interface FriendCardProps {
  friend: FriendClient
  onRemove: (userId: string) => void
  isRemoving: boolean
}

export function FriendCard({ friend, onRemove, isRemoving }: FriendCardProps) {
  const displayName = friend.displayName ?? `@${friend.username}`
  const initials = friend.username.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-gray-100">
      <div className="flex items-center gap-3">
        {friend.avatarUrl ? (
          <img
            src={friend.avatarUrl}
            alt={friend.username}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
            {initials}
          </div>
        )}
        <div>
          <p className="text-sm font-medium leading-none">{displayName}</p>
          {friend.displayName && (
            <p className="text-xs text-gray-400 mt-0.5">@{friend.username}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            {friend.streak.current > 0 ? `${friend.streak.current} day streak` : 'No active streak'}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        onClick={() => onRemove(friend.id)}
        isLoading={isRemoving}
        className="text-xs text-gray-400 hover:text-red-500"
      >
        Remove
      </Button>
    </div>
  )
}
