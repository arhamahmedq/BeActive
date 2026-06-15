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

const WORKOUT_EMOJIS: Record<string, string> = {
  GYM: '🏋️', RUNNING: '🏃', CYCLING: '🚴', SWIMMING: '🏊',
  YOGA: '🧘', HIIT: '⚡', SPORTS: '⚽', OTHER: '💪',
}
function workoutEmoji(type?: string): string {
  return (type && WORKOUT_EMOJIS[type]) || '💪'
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
    return <div className="bg-white rounded-3xl border-[1.5px] border-black overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] animate-pulse h-96" />
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
    <div className="bg-white rounded-3xl border-[1.5px] border-black overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
      {/* ── Top bar — Instagram-style identity (avatar · username · time).
            A full-width divider under it separates identity from the content. ── */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5 border-b-[1.5px] border-black">
        {author && (
          <Link
            href={`/u/${author.username}`}
            className="-my-0.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 transition-colors hover:bg-black/[0.04]"
          >
            <Avatar src={author.avatarUrl} name={author.username} size="lg" />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[14px] font-semibold leading-tight text-gray-900">{author.username}</span>
              <span className="text-gray-300" aria-hidden>·</span>
              <span className="shrink-0 text-[12px] font-medium text-gray-400">{relativeTime(post.createdAt)}</span>
            </span>
          </Link>
        )}
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          {workoutEmoji(post.workout?.type)} {workoutLabel(post.workout?.type)}
        </span>
      </div>

      {/* ── Photo — full image, never cropped (object-contain). A blurred copy
            of the same image fills any letterbox space. ───────────────────────── */}
      <div className="px-3 pb-3">
        <div
          className="relative rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
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
        <div className="px-4 pt-3 pb-1 border-t-[1.5px] border-black">
          <p className="text-[13px] text-gray-700 leading-relaxed italic">
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
