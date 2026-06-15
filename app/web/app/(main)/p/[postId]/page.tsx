'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { usePost } from '@/hooks/usePost'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { ApiError } from '@/lib/api/friends.api'
import { Avatar } from '@/components/ui/Avatar'
import { StoryShareButton } from '@/components/features/StoryShareButton'
import { canShowStoryShare, isLatestVerifiedDayPost } from '@/shared/utils'

// Workout type → editorial headline label (mirrors FeedCard).
const WORKOUT_LABELS: Record<string, string> = {
  GYM: 'Strength', RUNNING: 'Running', CYCLING: 'Cycling', SWIMMING: 'Swimming',
  YOGA: 'Yoga', HIIT: 'HIIT', SPORTS: 'Sports', OTHER: 'Workout',
}
function workoutLabel(type?: string): string {
  return (type && WORKOUT_LABELS[type]) || 'Workout'
}

function relativeTime(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Read-only single-post view (Slice 8A). Visibility (friends-only) is
// enforced by GET /api/posts/[id]. The story-card share surface is shown
// only to the post's owner once it's VERIFIED (see canShowStoryShare).
export default function PostDetailPage() {
  const params = useParams<{ postId: string }>()
  const postId = params?.postId ?? ''
  const { data: post, isLoading, isError, error } = usePost(postId)
  const { user } = useAuth()
  const { data: streakData } = useStreak()

  if (isLoading) {
    return <div className="bg-[#faf9f6] rounded-2xl border border-gray-200 overflow-hidden animate-pulse h-96" />
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
  const isPersonalBest = streakData
    ? streakData.current === streakData.best && streakData.current > 1
    : false

  return (
    <div className="bg-[#faf9f6] rounded-2xl border border-gray-200 overflow-hidden">
      {/* ── Eyebrow rule ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 border-b-2 border-black">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-black">{workoutLabel(post.workout?.type)} · Daily Proof</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-gray-400">{relativeTime(post.createdAt)}</span>
      </div>

      {/* ── Masthead — author identity ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-3">
        {author && (
          <Link
            href={`/u/${author.username}`}
            className="flex items-center gap-2.5 w-fit rounded-lg py-1 px-1.5 -mx-1.5 transition-colors hover:bg-black/[0.04]"
          >
            <Avatar src={author.avatarUrl} name={author.username} size="md" />
            <span className="text-[14px] font-bold text-gray-900 truncate">@{author.username}</span>
          </Link>
        )}
      </div>

      {/* ── Photo — full image, never cropped (object-contain). A blurred copy
            of the same image fills any letterbox space. ───────────────────────── */}
      <div className="px-3 pb-3">
        <div
          className="relative rounded-[6px] overflow-hidden bg-gray-100 flex items-center justify-center"
          style={{ minHeight: '240px', maxHeight: '640px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-50"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt={post.caption ?? 'workout'}
            className="relative z-[1] max-h-[640px] max-w-full w-auto h-auto object-contain"
          />
        </div>
      </div>

      {/* ── Caption — pull quote ────────────────────────────────────────────── */}
      {post.caption && (
        <div className="px-4 pb-1">
          <p className="text-[13px] text-gray-700 leading-relaxed italic border-t border-gray-200 pt-3">
            “{post.caption}”
          </p>
        </div>
      )}

      {canShowStoryShare(user?.id, post) &&
        isLatestVerifiedDayPost(post.createdAt, streakData?.lastVerifiedDate, streakData?.userTimezone) && (
        <div className="px-4 pt-3 pb-4">
          <StoryShareButton
            postId={post.id}
            streakCount={streakData?.current ?? null}
            workoutType={post.workout?.type}
            isPersonalBest={isPersonalBest}
          />
        </div>
      )}
    </div>
  )
}
