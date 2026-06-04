'use client'
import type { PendingFriendEntry } from '@/hooks/useFriends'
import { Button } from '@/components/ui/Button'

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
  const initials = entry.user.username.slice(0, 2).toUpperCase()
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-white rounded-xl border border-gray-100">
      <div className="flex items-center gap-3">
        {entry.user.avatarUrl ? (
          <img
            src={entry.user.avatarUrl}
            alt={entry.user.username}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
            {initials}
          </div>
        )}
        <p className="text-sm font-medium">@{entry.user.username}</p>
      </div>
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
                    variant="primary"
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
