'use client'
import type { FeedPostResponse } from '@/shared/types/feed'

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface FeedCardProps {
  post: FeedPostResponse
}

export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-9 w-9 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center text-sm font-medium text-gray-500">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            user.username.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">@{user.username}</p>
          <p className="text-xs text-gray-400">{relativeTime(createdAt)}</p>
        </div>
        {user.streak.current > 0 && (
          <div className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex-shrink-0">
            <span>{user.streak.current}</span>
            <span>day{user.streak.current !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Photo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={caption ?? `${user.username}'s workout`}
        className="w-full aspect-square object-cover bg-gray-50"
      />

      {/* Footer */}
      {(workout || caption) && (
        <div className="px-4 py-3 space-y-1.5">
          {workout && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              {workout.type.charAt(0) + workout.type.slice(1).toLowerCase()}
            </span>
          )}
          {caption && (
            <p className="text-sm text-gray-800">{caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
