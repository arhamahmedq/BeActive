'use client'
import { useState } from 'react'
import type { FeedPostResponse } from '@/shared/types/feed'
import { useLikeToggle } from '@/hooks/usePostEngagement'
import { CommentsSheet } from './CommentsSheet'

// All engagement icons at w-5 h-5 — uniform sizing across Like, Comment, Share
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

// Glass hover button — the premium interaction for post actions
const engagementBtn = 'inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-all duration-150 hover:bg-white/70 hover:backdrop-blur-sm hover:shadow-sm active:scale-95'

export function PostEngagementBar({ post }: { post: FeedPostResponse }) {
  const likeToggle = useLikeToggle()
  const [showComments, setShowComments] = useState(false)
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // dismissed or clipboard denied — no-op
    }
  }

  const [likeAnimating, setLikeAnimating] = useState(false)

  function handleLike() {
    if (!likeAnimating) {
      setLikeAnimating(true)
    }
    likeToggle.mutate({ postId: post.id, liked: post.likedByMe })
  }

  return (
    <div className="px-3 py-2 border-t border-white/40">
      <div className="flex items-center gap-0.5">
        {/* Like — heart pops on tap via animate-heart-pulse */}
        <button
          onClick={handleLike}
          className={`${engagementBtn} ${post.likedByMe ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <span
            className={`inline-block ${likeAnimating ? 'animate-heart-pulse' : ''}`}
            onAnimationEnd={() => setLikeAnimating(false)}
          >
            <HeartIcon filled={post.likedByMe} />
          </span>
          {post.likeCount > 0 && <span className="text-xs font-medium tabular-nums">{post.likeCount}</span>}
        </button>

        {/* Comment */}
        <button
          onClick={() => setShowComments(v => !v)}
          className={`${engagementBtn} ${showComments ? 'text-gray-900 bg-white/50' : 'text-gray-500 hover:text-gray-900'}`}
          aria-haspopup="dialog"
          aria-expanded={showComments}
          aria-label="Comments"
        >
          <CommentIcon />
          {post.commentCount > 0 && <span className="text-xs font-medium tabular-nums">{post.commentCount}</span>}
        </button>

        {/* Share */}
        <button
          onClick={share}
          className={`${engagementBtn} text-gray-500 hover:text-gray-900`}
          aria-label="Share post"
        >
          <ShareIcon />
          {copied && <span className="text-xs text-brand-600 font-medium whitespace-nowrap">Copied!</span>}
        </button>
      </div>

      <CommentsSheet
        open={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        postAuthorId={post.user.id}
        commentCount={post.commentCount}
      />
    </div>
  )
}
