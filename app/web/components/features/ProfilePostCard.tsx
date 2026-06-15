'use client'
import type { FeedPostResponse } from '@/shared/types/feed'
import { PostEngagementBar } from './PostEngagementBar'
import { getPlantLevel } from '@/lib/streak-levels'

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

// Profile-specific post presentation in the shared "Editorial" style.
// Deliberately OMITS the author identity (avatar/@username) — on a profile the
// header already establishes whose posts these are, so the masthead leads with
// the activity headline + streak instead. Interaction is the SHARED
// PostEngagementBar (same hooks/handlers as the feed) — feature parity.
export function ProfilePostCard({ post }: { post: FeedPostResponse }) {
  const { imageUrl, caption, createdAt, workout, user } = post
  const streak = user.streak.current
  const plant = getPlantLevel(streak)

  return (
    <div className="bg-white rounded-3xl border-[1.5px] border-black overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]">
      {/* ── Masthead — drop-cap streak + time + activity / evolution chips.
            Author identity is intentionally omitted on a profile (the page
            header already establishes whose posts these are). ─────────────── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-end gap-3">
          <span className="text-[52px] sm:text-[60px] leading-[0.78] font-black tabular-nums text-black">{streak}</span>
          <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 leading-tight">Day<br />streak</span>
          <span className="mb-1 ml-auto flex flex-col items-end gap-1.5">
            <span className="text-[11px] font-medium text-gray-400">{relativeTime(createdAt)}</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
                {workoutEmoji(workout?.type)} {workoutLabel(workout?.type)}
              </span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                  {plant.emoji} {plant.shortName}
                </span>
              )}
            </span>
          </span>
        </div>
      </div>

      {/* ── Photo — full image, never cropped (object-contain). A blurred copy
            of the same image fills any letterbox space. ───────────────────────── */}
      <div className="px-3 pb-3">
        <div
          className="relative rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
          style={{ minHeight: '220px', maxHeight: '560px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-50"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={caption ?? 'workout'}
            loading="lazy"
            className="relative z-[1] max-h-[560px] max-w-full w-auto h-auto object-contain"
          />
        </div>
      </div>

      {/* ── Footer divider — always present (full-width, dark): separates the
            photo from the caption / engagement footer, even with no caption ─── */}
      <div className="border-t-[1.5px] border-black" />

      {/* ── Caption — pull quote ────────────────────────────────────────────── */}
      {caption && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[13px] text-gray-700 leading-relaxed italic">
            “{caption}”
          </p>
        </div>
      )}

      <PostEngagementBar post={post} />
    </div>
  )
}
