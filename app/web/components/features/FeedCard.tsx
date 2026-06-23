'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { StoryShareButton } from './StoryShareButton'
import { formatRelativeTime } from '@/lib/formatters'
import { getPlantLevel } from '@/lib/streak-levels'
import { useAuth } from '@/hooks/useAuth'
import { useSavedPosts } from '@/hooks/useSavedPosts'
import { useStreak } from '@/hooks/useStreak'
import { blockUser } from '@/lib/api/friends.api'
import { canShowStoryShare, isLatestVerifiedDayPost } from '@/shared/utils'

// Workout type → on-brand label + emoji. The Editorial layout uses the label
// as the headline ("Strength Session"), so no per-type color tint is needed.
const WORKOUT_META: Record<string, { label: string; emoji: string }> = {
  GYM:      { label: 'Strength', emoji: '🏋️' },
  RUNNING:  { label: 'Running',  emoji: '🏃' },
  CYCLING:  { label: 'Cycling',  emoji: '🚴' },
  SWIMMING: { label: 'Swimming', emoji: '🏊' },
  YOGA:     { label: 'Yoga',     emoji: '🧘' },
  HIIT:     { label: 'HIIT',     emoji: '⚡' },
  SPORTS:   { label: 'Sports',   emoji: '⚽' },
  OTHER:    { label: 'Workout',  emoji: '💪' },
}

const menuItemCls = 'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none'

interface FeedCardProps {
  post: FeedPostResponse
}

// "Editorial" feed card — magazine cover layout: an eyebrow rule, the activity
// as a big condensed headline, a drop-cap streak number, and the user's full
// photo (never cropped). All values derive from FeedPostResponse + the
// streak-levels ladder — no invented metrics.
export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)
  const [pressed, setPressed] = useState(false)
  const { isSaved, savePost, unsavePost } = useSavedPosts()
  const { user: viewer } = useAuth()
  const { data: viewerStreak } = useStreak()
  const qc = useQueryClient()
  // feed.repo.ts (getFeedCandidates) always filters status: VERIFIED, so every
  // FeedPostResponse is implicitly VERIFIED — only the ownership check matters here.
  // Gate the share button to the viewer's LATEST verified day so older posts
  // don't each carry a share surface once a newer post exists (keeps the feed clean).
  const showStoryShare =
    canShowStoryShare(viewer?.id, { status: 'VERIFIED', user }) &&
    isLatestVerifiedDayPost(createdAt, viewerStreak?.lastVerifiedDate, viewerStreak?.userTimezone)

  // Evolution + activity — all from real post data (streak-levels ladder).
  const streak = user.streak.current
  const plant = getPlantLevel(streak)
  const m = workout ? (WORKOUT_META[workout.type] ?? WORKOUT_META.OTHER) : WORKOUT_META.OTHER

  async function handleBlock() {
    setIsBlocking(true)
    try {
      await blockUser(user.id)
      setMenuOpen(false)
      setConfirmBlock(false)
      void qc.invalidateQueries({ queryKey: ['feed'] })
      void qc.invalidateQueries({ queryKey: ['friends'] })
    } finally {
      setIsBlocking(false)
    }
  }
  const saved = isSaved(post.id)

  function toggleSave() {
    if (saved) unsavePost(post.id)
    else savePost({ id: post.id, imageUrl, caption: caption ?? null, username: user.username, avatarUrl: user.avatarUrl ?? null, createdAt })
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(`${window.location.origin}/p/${post.id}`)
    setMenuOpen(false)
  }

  return (
    <article
      className="bg-white rounded-3xl border-[1px] border-black/40 overflow-hidden transition-all duration-200 ease-out
                 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]
                 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.05)]
                 hover:-translate-y-[2px]
                 active:scale-[0.99] active:shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
      style={{
        WebkitTransform: pressed ? 'scale(0.99)' : undefined,
        transition: 'transform 120ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 200ms ease-out',
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
    >
      {/* ── Top bar — Instagram-style identity (avatar · username · time).
            A full-width divider under it separates identity from the masthead. ─ */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5 border-b-[1px] border-black/40">
        <Link
          href={`/u/${user.username}`}
          className="-my-0.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 transition-colors hover:bg-black/[0.04]"
        >
          <Avatar src={user.avatarUrl} name={user.username} size="lg" />
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold leading-tight text-gray-900">{user.username}</span>
            <span className="text-gray-300" aria-hidden>·</span>
            <span className="shrink-0 text-[12px] font-medium text-gray-400">{formatRelativeTime(createdAt)}</span>
          </span>
        </Link>

        {/* Save button */}
        <button
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save post'}
          aria-pressed={saved}
          className={`-mr-1 p-1.5 rounded-lg transition-all duration-150 hover:bg-black/[0.05] active:scale-90 ${
            saved ? 'text-black' : 'text-gray-400 hover:text-black'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        {/* 3-dot menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className="-mr-1.5 p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-black/[0.05] active:scale-90 transition-all duration-150"
          >
            <svg viewBox="0 0 24 24" className="w-[17px] h-[17px]" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                role="menu"
                className="absolute right-0 top-9 z-20 w-48 bg-white border border-gray-200 shadow-xl rounded-2xl py-1.5 animate-spring-in overflow-hidden"
              >
                <button role="menuitem" onClick={() => { toggleSave(); setMenuOpen(false) }} className={`${menuItemCls} text-gray-800 hover:bg-black/[0.04]`}>
                  {saved ? 'Saved ✓' : 'Add to saved'}
                </button>
                <button role="menuitem" onClick={handleCopyLink} className={`${menuItemCls} text-gray-800 hover:bg-black/[0.04]`}>
                  Copy link
                </button>
                <Link role="menuitem" href={`/u/${user.username}`} onClick={() => setMenuOpen(false)} className={`block ${menuItemCls} text-gray-800 hover:bg-black/[0.04]`}>
                  View profile
                </Link>
                <div className="my-1 border-t border-gray-200" />
                {confirmBlock ? (
                  <>
                    <button role="menuitem" onClick={handleBlock} disabled={isBlocking} className={`${menuItemCls} text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50`}>
                      {isBlocking ? 'Blocking…' : `Block @${user.username}?`}
                    </button>
                    <button role="menuitem" onClick={() => setConfirmBlock(false)} className={`${menuItemCls} text-gray-400 hover:bg-black/[0.04]`}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button role="menuitem" onClick={() => setConfirmBlock(true)} className={`${menuItemCls} text-red-500 hover:bg-red-50`}>
                    Block
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Masthead — drop-cap streak + activity / evolution chips ─────────── */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-end gap-3">
          <span className="text-[52px] sm:text-[60px] leading-[0.78] font-black tabular-nums text-black">{streak}</span>
          <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 leading-tight">Day<br />streak</span>
          <span className="mb-1.5 ml-auto flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
              {m.emoji} {m.label}
            </span>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-700">
                {plant.emoji} {plant.shortName}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── Photo — the user's full image, never cropped (object-contain).
            Letterbox space falls back to a neutral fill. ──────────────────────
            ponytail: removed the blurred-bg <img> — it eager-loaded a 2nd full-res
            copy of every photo (no lazy) and ran a blur-2xl GPU filter per card,
            which was the feed's scroll jank. Add a real blurred fill back only via
            a tiny thumbnail variant, never the full image. */}
      <div className="px-3 pb-3">
        <div
          className="relative group/image rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center"
          style={{ minHeight: '220px', maxHeight: '560px' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={caption ?? `${user.username}'s workout`}
            loading="lazy"
            decoding="async"
            className="relative z-[1] max-h-[560px] max-w-full w-auto h-auto object-contain transition-opacity duration-200 group-hover/image:opacity-95"
          />
        </div>
      </div>

      {/* ── Footer divider — always present (full-width, dark): separates the
            photo from the caption / engagement footer, even with no caption ─── */}
      <div className="border-t-[1px] border-black/40" />

      {/* ── Caption — pull quote ────────────────────────────────────────────── */}
      {caption && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[13px] text-gray-700 leading-relaxed italic">
            “{caption}”
          </p>
        </div>
      )}

      {/* ── Engagement bar (real likes / comments / share) ─────────────────── */}
      <PostEngagementBar post={post} />

      {/* ── Story share (own VERIFIED posts only) ──────────────────────────── */}
      {showStoryShare && (
        <div className="px-4 pb-3">
          <StoryShareButton
            postId={post.id}
            streakCount={user.streak.current}
            workoutType={workout?.type}
            isPersonalBest={false}
          />
        </div>
      )}
    </article>
  )
}
