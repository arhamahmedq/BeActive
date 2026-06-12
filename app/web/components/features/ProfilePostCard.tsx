'use client'
import type { FeedPostResponse } from '@/shared/types/feed'
import { PostEngagementBar } from './PostEngagementBar'

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Profile-specific post presentation. Deliberately OMITS the author header
// (avatar/@username/streak) that FeedCard shows — on a profile the header
// already establishes whose posts these are, so repeating it per-post is what
// made the profile read like the feed. Interaction is the SHARED PostEngagementBar
// (same hooks, handlers, optimistic state as the feed) — feature parity, not
// layout parity.
export function ProfilePostCard({ post }: { post: FeedPostResponse }) {
  const { imageUrl, caption, createdAt, workout } = post

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={caption ?? 'workout'}
        loading="lazy"
        className="w-full aspect-square object-cover bg-gray-50"
      />

      <div className="px-4 pt-3 flex items-center gap-2">
        {workout && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            {workout.type.charAt(0) + workout.type.slice(1).toLowerCase()}
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">{relativeTime(createdAt)}</span>
      </div>

      {caption && <p className="px-4 pt-1.5 text-sm text-gray-800">{caption}</p>}

      <PostEngagementBar post={post} />
    </div>
  )
}
