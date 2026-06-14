'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { StoryShareButton } from './StoryShareButton'
import { formatRelativeTime } from '@/lib/formatters'
import { useAuth } from '@/hooks/useAuth'
import { useSavedPosts } from '@/hooks/useSavedPosts'
import { blockUser } from '@/lib/api/friends.api'
import { canShowStoryShare } from '@/shared/utils'

// Workout type → color-coded badge styling
const workoutBadgeStyle: Record<string, string> = {
  GYM:      'bg-violet-500/80',
  RUNNING:  'bg-orange-500/80',
  CYCLING:  'bg-blue-500/80',
  SWIMMING: 'bg-cyan-500/80',
  YOGA:     'bg-pink-500/80',
  HIIT:     'bg-red-500/80',
  SPORTS:   'bg-green-600/80',
  OTHER:    'bg-gray-600/80',
}

const menuItemCls = 'w-full text-left px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none'

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

  const badgeBg = workout ? (workoutBadgeStyle[workout.type] ?? workoutBadgeStyle.OTHER) : ''

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
      <div className="flex items-center gap-2 px-3 py-2">
        {/* User identity */}
        <Link
          href={`/u/${user.username}`}
          className="flex items-center gap-2.5 flex-1 min-w-0 py-1 px-1.5 rounded-xl transition-all duration-150 hover:bg-black/[0.03]"
        >
          <span className="flex-shrink-0 transition-transform duration-150 hover:scale-105">
            <Avatar src={user.avatarUrl} name={user.username} size="md" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
              @{user.username}
            </p>
            <p className="text-[11px] text-gray-400 leading-none mt-0.5">
              {formatRelativeTime(createdAt)}
            </p>
          </div>
        </Link>

        {/* Streak pill */}
        {user.streak.current > 0 && (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              user.streak.current >= 7
                ? 'text-brand-700 bg-brand-100'
                : 'text-gray-600 bg-gray-100'
            }`}
          >
            <span aria-hidden className="text-[10px]">🔥</span>
            <span className="tabular-nums">{user.streak.current}</span>
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

      {/* ── Photo ────────────────────────────────────────────────────────── */}
      <div className="relative group/image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={caption ?? `${user.username}'s workout`}
          loading="lazy"
          className="w-full aspect-[4/5] max-h-[420px] object-cover bg-gray-100 transition-opacity duration-200 group-hover/image:opacity-95"
        />

        {/* Top gradient — smooth caption + badge readability */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/10 to-transparent pointer-events-none" aria-hidden />

        {/* Bottom gradient — subtle depth */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/12 to-transparent pointer-events-none" aria-hidden />

        {/* Workout type badge — color-coded, top-left */}
        {workout && (
          <span
            className={`absolute top-2.5 left-2.5 flex items-center gap-1 ${badgeBg} text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md border border-white/15 tracking-wide uppercase`}
          >
            💪 {workout.type.charAt(0) + workout.type.slice(1).toLowerCase()}
          </span>
        )}
      </div>

      {/* ── Caption ──────────────────────────────────────────────────────── */}
      {caption && (
        <div className="px-4 pt-2.5 pb-0">
          <p className="text-[13px] text-gray-700 leading-relaxed">{caption}</p>
        </div>
      )}

      {/* ── Engagement bar ───────────────────────────────────────────────── */}
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
