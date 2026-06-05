'use client'
import type { UserSearchResult } from '@/lib/api/users.api'

interface UserSearchProps {
  query: string
  onQueryChange: (q: string) => void
  results: UserSearchResult[]
  isSearching: boolean
  isRateLimited: boolean
  hasQuery: boolean
  sentUserIds: Set<string>
  friendUserIds: Set<string>
  onSendRequest: (userId: string) => void
  sendingUserId: string | null
}

export function UserSearch({
  query,
  onQueryChange,
  results,
  isSearching,
  isRateLimited,
  hasQuery,
  sentUserIds,
  friendUserIds,
  onSendRequest,
  sendingUserId,
}: UserSearchProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        {isSearching && (
          <div className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-black" />
        )}
      </div>

      {isRateLimited && (
        <p className="text-xs text-amber-600 px-1">Searching too fast — please slow down.</p>
      )}

      {hasQuery && !isSearching && results.length === 0 && !isRateLimited && (
        <p className="text-xs text-gray-400 px-1">No users found for &ldquo;{query}&rdquo;</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => {
            const isFriend = friendUserIds.has(user.id)
            const isPending = sentUserIds.has(user.id)
            const isSending = sendingUserId === user.id
            const initials = user.username.slice(0, 2).toUpperCase()

            return (
              <div
                key={user.id}
                className="flex items-center justify-between py-2.5 px-4 bg-white rounded-xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-500">
                      {initials}
                    </div>
                  )}
                  <p className="text-sm font-medium">@{user.username}</p>
                </div>

                {isFriend ? (
                  <span className="text-xs text-gray-400">Friends</span>
                ) : isPending ? (
                  <span className="text-xs text-gray-400">Pending</span>
                ) : (
                  <button
                    onClick={() => onSendRequest(user.id)}
                    disabled={isSending}
                    className="text-xs font-medium text-black hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSending ? 'Sending…' : '+ Add'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
