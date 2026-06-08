'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePost } from '@/hooks/usePost'
import { ApiError } from '@/lib/api/friends.api'
import { Avatar } from '@/components/ui/Avatar'

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Read-only single-post view (Slice 8A). No likes/comments/share — those are
// later slices. Visibility (friends-only) is enforced by GET /api/posts/[id].
export default function PostDetailPage() {
  const params = useParams<{ postId: string }>()
  const postId = params?.postId ?? ''
  const { data: post, isLoading, isError, error } = usePost(postId)

  if (isLoading) {
    return <div className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse h-96" />
  }

  if (isError || !post) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-2">
        <p className="text-sm font-medium text-gray-700">
          {notFound ? 'Post not found, or you’re not friends with the author' : 'Couldn’t load this post'}
        </p>
        <Link href="/feed" className="text-xs text-gray-400 hover:text-black">
          ← Back to feed
        </Link>
      </div>
    )
  }

  const author = post.user

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {author && (
        <Link href={`/u/${author.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
          <Avatar src={author.avatarUrl} name={author.username} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">@{author.username}</p>
            <p className="text-xs text-gray-400">{relativeTime(post.createdAt)}</p>
          </div>
        </Link>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={post.imageUrl}
        alt={post.caption ?? 'workout'}
        className="w-full aspect-[4/5] object-cover bg-gray-50"
      />

      {(post.workout || post.caption) && (
        <div className="px-4 py-3 space-y-1.5">
          {post.workout && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              {post.workout.type.charAt(0) + post.workout.type.slice(1).toLowerCase()}
            </span>
          )}
          {post.caption && <p className="text-sm text-gray-800">{post.caption}</p>}
        </div>
      )}
    </div>
  )
}
