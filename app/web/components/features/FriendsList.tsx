'use client'
import type { FriendClient } from '@/hooks/useFriends'
import { FriendCard } from './FriendCard'

interface FriendsListProps {
  friends: FriendClient[]
  isLoading: boolean
  removingFriendshipId: string | null
  onRemove: (friendshipId: string) => void
}

function FriendSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-white rounded-xl border border-gray-100 animate-pulse">
      <div className="h-10 w-10 rounded-full bg-gray-100" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-24 bg-gray-100 rounded" />
        <div className="h-2.5 w-16 bg-gray-100 rounded" />
      </div>
    </div>
  )
}

export function FriendsList({ friends, isLoading, removingFriendshipId, onRemove }: FriendsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <FriendSkeleton key={i} />)}
      </div>
    )
  }

  if (friends.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <p className="text-sm text-gray-500">No friends yet.</p>
        <p className="text-xs text-gray-400 mt-1">Use the search above to find people to train with.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {friends.map((friend) => (
        <FriendCard
          key={friend.id}
          friend={friend}
          onRemove={onRemove}
          isRemoving={removingFriendshipId === friend.friendshipId}
        />
      ))}
    </div>
  )
}
