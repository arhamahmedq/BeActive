'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { formatRelativeTime } from '@/lib/formatters'
import { useSavedPosts } from '@/hooks/useSavedPosts'

// Shared glass hover for icon buttons in the card header
const cardIconBtn = 'p-2 rounded-lg transition-all duration-150 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm active:scale-95 flex-shrink-0'

interface FeedCardProps {
  post: FeedPostResponse
}

export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post
  const [menuOpen, setMenuOpen] = useState(false)
  const { isSaved, savePost, unsavePost } = useSavedPosts()
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
      <div className="flex items-center gap-2 px-3 py-3">
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
                <button
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors focus:outline-none focus:bg-red-50"
                >
                  Report
                </button>
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
          className="w-full aspect-square object-cover bg-gray-100 transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {/* Workout type overlay badge */}
        {workout && (
          <span className="absolute top-2.5 left-2.5 bg-black/65 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md backdrop-blur-sm">
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
