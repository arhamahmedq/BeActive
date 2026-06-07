'use client'
import { useState } from 'react'
import type { FeedPostResponse } from '@/shared/types/feed'
import { useLikeToggle } from '@/hooks/usePostEngagement'
import { CommentsSection } from './CommentsSection'

// Engagement bar rendered on the post card: like (POST/DELETE, optimistic),
// expandable comments, and copy-link share. Reads counts/likedByMe straight off
// the feed-provided post — no extra fetch until comments are expanded.
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
    <div className="px-4 py-2 border-t border-gray-50">
      <div className="flex items-center gap-5 text-sm">
        <button
          onClick={() => likeToggle.mutate({ postId: post.id, liked: post.likedByMe })}
          className={`inline-flex items-center gap-1.5 transition-colors ${
            post.likedByMe ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
          }`}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          <span aria-hidden>{post.likedByMe ? '♥' : '♡'}</span>
          {post.likeCount > 0 && <span>{post.likeCount}</span>}
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          aria-expanded={showComments}
        >
          <span aria-hidden>💬</span>
          {post.commentCount > 0 && <span>{post.commentCount}</span>}
        </button>

        <button
          onClick={share}
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors ml-auto"
          aria-label="Share post"
        >
          <span aria-hidden>↗</span>
          <span>{copied ? 'Copied!' : 'Share'}</span>
        </button>
      </div>

      {showComments && <CommentsSection postId={post.id} postAuthorId={post.user.id} />}
    </div>
  )
}
