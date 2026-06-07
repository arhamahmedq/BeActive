'use client'
import Link from 'next/link'
import type { PendingFriendEntry } from '@/hooks/useFriends'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'

interface FriendRequestsProps {
  incoming: PendingFriendEntry[]
  outgoing: PendingFriendEntry[]
  isLoading: boolean
  acceptingId: string | null
  rejectingId: string | null
  cancellingId: string | null
  onAccept: (friendshipId: string) => void
  onReject: (friendshipId: string) => void
  onCancel: (friendshipId: string) => void
}

function PendingEntry({
  entry,
  actions,
}: {
  entry: PendingFriendEntry
  actions: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-gray-100">
      <Link
        href={`/u/${entry.user.username}`}
        className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
      >
        <Avatar src={entry.user.avatarUrl} name={entry.user.username} size="md" />
        <p className="text-sm font-medium truncate">@{entry.user.username}</p>
      </Link>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}

export function FriendRequests({
  incoming,
  outgoing,
  isLoading,
  acceptingId,
  rejectingId,
  cancellingId,
  onAccept,
  onReject,
  onCancel,
}: FriendRequestsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3 px-4 bg-white rounded-xl border border-gray-100 animate-pulse">
            <div className="h-9 w-9 rounded-full bg-gray-100" />
            <div className="h-3 w-28 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (incoming.length === 0 && outgoing.length === 0) return null

  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
            Incoming ({incoming.length})
          </p>
          {incoming.map((entry) => (
            <PendingEntry
              key={entry.friendshipId}
              entry={entry}
              actions={
                <>
                  <Button
                    variant="brand"
                    onClick={() => onAccept(entry.friendshipId)}
                    isLoading={acceptingId === entry.friendshipId}
                    className="text-xs py-1.5 px-3"
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => onReject(entry.friendshipId)}
                    isLoading={rejectingId === entry.friendshipId}
                    className="text-xs py-1.5 px-3 text-gray-400 hover:text-red-500"
                  >
                    Decline
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-1">
            Sent ({outgoing.length})
          </p>
          {outgoing.map((entry) => (
            <PendingEntry
              key={entry.friendshipId}
              entry={entry}
              actions={
                <Button
                  variant="ghost"
                  onClick={() => onCancel(entry.friendshipId)}
                  isLoading={cancellingId === entry.friendshipId}
                  className="text-xs py-1.5 px-3 text-gray-400 hover:text-red-500"
                >
                  Cancel
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
