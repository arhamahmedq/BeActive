'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { FeedPostResponse } from '@/shared/types/feed'
import { Avatar } from '@/components/ui/Avatar'
import { PostEngagementBar } from './PostEngagementBar'
import { formatRelativeTime } from '@/lib/formatters'

interface FeedCardProps {
  post: FeedPostResponse
}

export function FeedCard({ post }: FeedCardProps) {
  const { user, workout, caption, imageUrl, createdAt } = post
  const [menuOpen, setMenuOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleCopyLink() {
    void navigator.clipboard.writeText(`${window.location.origin}/p/${post.id}`)
    setMenuOpen(false)
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href={`/u/${user.username}`}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
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
            <span>{user.streak.current}</span>
            <span>day{user.streak.current !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={() => setSaved(v => !v)}
          aria-label={saved ? 'Remove from saved' : 'Save post'}
          className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>

        {/* 3-dot menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
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
              <div className="absolute right-0 top-8 z-20 w-44 glass-overlay rounded-xl py-1 animate-pop shadow-lg">
                <button
                  onClick={() => { setSaved(true); setMenuOpen(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-white/60 transition-colors"
                >
                  {saved ? 'Saved ✓' : 'Add to saved'}
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-white/60 transition-colors"
                >
                  Copy link
                </button>
                <Link
                  href={`/u/${user.username}`}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-white/60 transition-colors"
                >
                  View profile
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-white/60 transition-colors"
                >
                  Report
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Photo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={caption ?? `${user.username}'s workout`}
        className="w-full aspect-square object-cover bg-gray-50"
      />

      {/* Footer */}
      {(workout || caption) && (
        <div className="px-4 py-3 space-y-1.5">
          {workout && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              {workout.type.charAt(0) + workout.type.slice(1).toLowerCase()}
            </span>
          )}
          {caption && (
            <p className="text-sm text-gray-800">{caption}</p>
          )}
        </div>
      )}

      {/* Like / comment / share */}
      <PostEngagementBar post={post} />
    </div>
  )
}
