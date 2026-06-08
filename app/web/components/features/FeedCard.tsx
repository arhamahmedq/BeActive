'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { formatRelativeTime } from '@/lib/formatters'
import { useSavedPosts } from '@/hooks/useSavedPosts'
import { blockUser } from '@/lib/api/friends.api'

// Shared glass hover for icon buttons in the card header
const cardIconBtn = 'p-2 rounded-lg transition-all duration-150 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm active:scale-95 flex-shrink-0'

interface FeedCardProps {
  post: FeedPostResponse
}

export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)
  const { isSaved, savePost, unsavePost } = useSavedPosts()
  const qc = useQueryClient()

  async function handleBlock() {
    setIsBlocking(true)
    try {
      await blockUser(user.id)
      setMenuOpen(false)
      setConfirmBlock(false)
      // Remove blocked user's posts from all cached pages
      void qc.invalidateQueries({ queryKey: ['feed'] })
      void qc.invalidateQueries({ queryKey: ['friends'] })
    } finally {
      setIsBlocking(false)
    }
  }
  const saved = isSaved(post.id)

  function toggleSave() {
    if (saved) {
      unsavePost(post.id)
    } else {
      savePost({
        id: post.id,
        imageUrl,
        caption: caption ?? null,
        username: user.username,
        avatarUrl: user.avatarUrl ?? null,
        createdAt,
      })
    }
  }

  function handleCopyLink() {
    void navigator.clipboard.writeText(`${window.location.origin}/p/${post.id}`)
    setMenuOpen(false)
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* User identity — ring on hover clearly signals clickability over glass bg */}
        <Link
          href={`/u/${user.username}`}
          className="flex items-center gap-3 flex-1 min-w-0 py-1 px-1.5 rounded-xl transition-all duration-150 hover:bg-black/[0.035] hover:ring-1 hover:ring-black/5"
        >
          <Avatar src={user.avatarUrl} name={user.username} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">@{user.username}</p>
            <p className="text-xs text-gray-400">{formatRelativeTime(createdAt)}</p>
          </div>
        </Link>

        {/* Streak pill */}
        {user.streak.current > 0 && (
          <div className="flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full flex-shrink-0">
            <span aria-hidden>🔥</span>
            <span>{user.streak.current}</span>
          </div>
        )}

        {/* Save — glass hover matches engagement bar */}
        <button
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save post'}
          aria-pressed={saved}
          className={`${cardIconBtn} ${saved ? 'text-gray-800' : 'text-gray-400 hover:text-gray-700'}`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        {/* 3-dot menu — glass hover */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className={`${cardIconBtn} text-gray-400 hover:text-gray-700`}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
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
                aria-label="Post options"
                className="absolute right-0 top-9 z-20 w-48 bg-white rounded-xl py-1.5 animate-pop"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}
              >
                <button
                  role="menuitem"
                  onClick={() => { toggleSave(); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:bg-gray-50"
                >
                  {saved ? 'Saved ✓' : 'Add to saved'}
                </button>
                <button
                  role="menuitem"
                  onClick={handleCopyLink}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:bg-gray-50"
                >
                  Copy link
                </button>
                <Link
                  role="menuitem"
                  href={`/u/${user.username}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100 transition-colors focus:outline-none focus:bg-gray-50"
                >
                  View profile
                </Link>
                <div className="my-1 border-t border-gray-100" />
                {confirmBlock ? (
                  <>
                    <button
                      role="menuitem"
                      onClick={handleBlock}
                      disabled={isBlocking}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors focus:outline-none disabled:opacity-50"
                    >
                      {isBlocking ? 'Blocking…' : `Block @${user.username}?`}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => setConfirmBlock(false)}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors focus:outline-none"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    role="menuitem"
                    onClick={() => setConfirmBlock(true)}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors focus:outline-none focus:bg-red-50"
                  >
                    Block
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Photo — with workout type badge overlaid top-left */}
      <div className="relative group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={caption ?? `${user.username}'s workout`}
          loading="lazy"
          className="w-full aspect-[4/5] max-h-[420px] object-cover bg-gray-100"
        />
        {/* Bottom gradient for caption legibility */}
        {caption && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" aria-hidden />
        )}
        {/* Workout type overlay badge */}
        {workout && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/55 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10">
            <span aria-hidden>💪</span>
            {workout.type.charAt(0) + workout.type.slice(1).toLowerCase()}
          </span>
        )}
      </div>

      {/* Caption (workout badge moved to image overlay) */}
      {caption && (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-800 leading-relaxed">{caption}</p>
        </div>
      )}

      {/* Like / comment / share */}
      <PostEngagementBar post={post} />
    </div>
  )
}
