'use client'
import { useState } from 'react'
import type { FeedPostResponse } from '@/shared/types/feed'
import { useLikeToggle } from '@/hooks/usePostEngagement'
import { CommentsSection } from './CommentsSection'

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
      // user dismissed the share sheet, or clipboard denied — no-op
    }
  }

  return (
    <div className="px-4 py-3 border-t border-white/40">
      <div className="flex items-center gap-2">
        {/* Like */}
        <button
          onClick={() => likeToggle.mutate({ postId: post.id, liked: post.likedByMe })}
          className={`inline-flex items-center gap-1.5 p-2 -ml-2 rounded-lg transition-colors ${
            post.likedByMe ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
          }`}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill={post.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {post.likeCount > 0 && <span className="text-sm font-medium">{post.likeCount}</span>}
        </button>

        {/* Comment */}
        <button
          onClick={() => setShowComments(v => !v)}
          className="inline-flex items-center gap-1.5 p-2 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
          aria-expanded={showComments}
          aria-label="Comments"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {post.commentCount > 0 && <span className="text-sm font-medium">{post.commentCount}</span>}
        </button>

        {/* Share — immediately after comment */}
        <button
          onClick={share}
          className="inline-flex items-center gap-1.5 p-2 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
          aria-label="Share post"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
          </svg>
          {copied && <span className="text-xs text-brand-600 font-medium">Copied!</span>}
        </button>
      </div>

      {showComments && <CommentsSection postId={post.id} postAuthorId={post.user.id} />}
    </div>
  )
}
