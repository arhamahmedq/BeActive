'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { StoryShareButton } from './StoryShareButton'
import { formatRelativeTime } from '@/lib/formatters'
import { getPlantLevel, getPlantLevelProgress } from '@/lib/streak-levels'
import { useAuth } from '@/hooks/useAuth'
import { useSavedPosts } from '@/hooks/useSavedPosts'
import { blockUser } from '@/lib/api/friends.api'
import { canShowStoryShare } from '@/shared/utils'

// Workout type → on-brand label + emoji + accent. Mirrors the badge palette
// but exposes a hex accent so the photo badge can tint itself.
const WORKOUT_META: Record<string, { label: string; emoji: string; color: string }> = {
  GYM:      { label: 'Strength', emoji: '🏋️', color: '#8b5cf6' },
  RUNNING:  { label: 'Running',  emoji: '🏃', color: '#f97316' },
  CYCLING:  { label: 'Cycling',  emoji: '🚴', color: '#3b82f6' },
  SWIMMING: { label: 'Swimming', emoji: '🏊', color: '#06b6d4' },
  YOGA:     { label: 'Yoga',     emoji: '🧘', color: '#ec4899' },
  HIIT:     { label: 'HIIT',     emoji: '⚡', color: '#ef4444' },
  SPORTS:   { label: 'Sports',   emoji: '⚽', color: '#16a34a' },
  OTHER:    { label: 'Workout',  emoji: '💪', color: '#6b7280' },
}

const menuItemCls = 'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none'

// Signature proof-strip stat — one real fact (Streak · Activity · Evolution).
function StripStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0 text-center">
      <div className="text-[9px] uppercase tracking-[0.1em] text-gray-400 font-bold truncate">{label}</div>
      <div className="mt-0.5 text-[12px] sm:text-[13px] font-extrabold tracking-tight text-gray-900 truncate tabular-nums">{value}</div>
    </div>
  )
}

interface FeedCardProps {
  post: FeedPostResponse
}

export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)
  const [pressed, setPressed] = useState(false)
  const { isSaved, savePost, unsavePost } = useSavedPosts()
  const { user: viewer } = useAuth()
  const qc = useQueryClient()
  // feed.repo.ts (getFeedCandidates) always filters status: VERIFIED, so every
  // FeedPostResponse is implicitly VERIFIED — only the ownership check matters here.
  const showStoryShare = canShowStoryShare(viewer?.id, { status: 'VERIFIED', user })

  // Evolution + activity — all from real post data (streak-levels ladder).
  const streak = user.streak.current
  const plant = getPlantLevel(streak)
  const haloPct = Math.round(getPlantLevelProgress(streak, plant) * 100)
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
      className="glass-card rounded-2xl overflow-hidden transition-all duration-200 ease-out
                 hover:shadow-[0_8px_32px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]
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
      {/* ── Card header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* User identity — evolution-halo avatar */}
        <Link
          href={`/u/${user.username}`}
          className="flex items-center gap-2.5 flex-1 min-w-0 py-1 px-1.5 rounded-xl transition-all duration-150 hover:bg-black/[0.03]"
        >
          <span className="relative h-11 w-11 flex-shrink-0 block transition-transform duration-150 hover:scale-105">
            {/* conic ring = progress to next plant tier */}
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: `conic-gradient(#22c55e ${haloPct * 3.6}deg, rgba(34,197,94,0.16) 0deg)` }}
              aria-hidden
            />
            <span className="absolute inset-[3px] rounded-full bg-white" aria-hidden />
            <span className="absolute inset-[4px] rounded-full overflow-hidden">
              <Avatar src={user.avatarUrl} name={user.username} size="lg" className="!h-full !w-full" />
            </span>
            {streak > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[14px] drop-shadow-sm select-none" aria-hidden>{plant.emoji}</span>
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
              @{user.username}
            </p>
            <p className="text-[11px] text-gray-400 leading-none mt-0.5">
              {m.label} · {formatRelativeTime(createdAt)}
            </p>
          </div>
        </Link>

        {/* Streak flame chip */}
        {streak > 0 && (
          <div className="flex items-center gap-1 text-[12px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0 bg-brand-50 border border-brand-100 text-brand-700">
            <span aria-hidden className="text-[10px]">🔥</span>
            <span className="tabular-nums">{streak}</span>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save post'}
          aria-pressed={saved}
          className={`p-2 rounded-xl transition-all duration-150 hover:bg-white/70 hover:shadow-sm active:scale-90 flex-shrink-0 ${
            saved ? 'text-gray-800' : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        {/* 3-dot menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white/70 hover:shadow-sm active:scale-90 transition-all duration-150"
          >
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor" aria-hidden>
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
                className="absolute right-0 top-10 z-20 w-48 glass-overlay rounded-2xl py-1.5 animate-spring-in overflow-hidden"
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
                <div className="my-1 border-t border-white/40" />
                {confirmBlock ? (
                  <>
                    <button role="menuitem" onClick={handleBlock} disabled={isBlocking} className={`${menuItemCls} text-red-600 bg-red-50/70 hover:bg-red-100/70 disabled:opacity-50`}>
                      {isBlocking ? 'Blocking…' : `Block @${user.username}?`}
                    </button>
                    <button role="menuitem" onClick={() => setConfirmBlock(false)} className={`${menuItemCls} text-gray-400 hover:bg-black/[0.04]`}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button role="menuitem" onClick={() => setConfirmBlock(true)} className={`${menuItemCls} text-red-500 hover:bg-red-50/70`}>
                    Block
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Photo + signature proof strip ──────────────────────────────────── */}
      {/* The user's photo is the hero: shown in full (object-contain), never
          cropped, regardless of orientation. A blurred copy of the same image
          fills any letterbox space so portrait/landscape/square all stay
          premium with no dead gray bars. The proof strip lives BELOW the photo
          so it can never cover user content. */}
      <div className="px-2">
        <div
          className="relative group/image rounded-[18px] overflow-hidden bg-gray-100 flex items-center justify-center"
          style={{ minHeight: '220px', maxHeight: '560px' }}
        >
          {/* Blurred backdrop — fills letterbox area for off-ratio photos */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-50"
          />

          {/* The hero photo — full image, aspect preserved, never cropped */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={caption ?? `${user.username}'s workout`}
            loading="lazy"
            className="relative z-[1] max-h-[560px] max-w-full w-auto h-auto object-contain transition-opacity duration-200 group-hover/image:opacity-95"
          />

          {/* Workout type badge — color-coded, top-left */}
          {workout && (
            <span
              className="absolute z-[2] top-2.5 left-2.5 flex items-center gap-1 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md border border-white/20 tracking-wide uppercase"
              style={{ background: `${m.color}d9` }}
            >
              {m.emoji} {m.label}
            </span>
          )}
        </div>

        {/* Proof strip — three real facts (Streak · Activity · Evolution).
            Sits below the photo so it never obscures the image. */}
        <div className="mt-2 rounded-2xl bg-white/85 backdrop-blur-md border border-black/[0.04] px-2.5 sm:px-3 py-2.5 flex items-center gap-1.5 sm:gap-2 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.25)]">
          <StripStat label="Streak" value={`${streak}d`} />
          <span className="h-7 w-px bg-gray-200" />
          <StripStat label="Activity" value={m.label} />
          <span className="h-7 w-px bg-gray-200" />
          <StripStat label="Evolution" value={`${plant.emoji} ${plant.shortName}`} />
        </div>
      </div>

      {/* ── Caption ──────────────────────────────────────────────────────── */}
      {caption && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-[13px] text-gray-700 leading-relaxed">{caption}</p>
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
