'use client'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useComments, useAddComment, useDeleteComment } from '@/hooks/useComments'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { formatRelativeTime } from '@/lib/formatters'

// Lightweight comments under a post card: list + composer. Only mounted when the
// card's comment toggle is open (useComments fires on mount).
export function CommentsSection({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(
    postId,
    true,
  )
  const { user } = useAuth()
  const addComment = useAddComment(postId)
  const deleteComment = useDeleteComment(postId)
  const [text, setText] = useState('')

  const comments = data?.pages.flatMap((p) => p.comments) ?? []

  function submit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || addComment.isPending) return
    addComment.mutate(body, { onSuccess: () => setText('') })
  }

  return (
    <div className="mt-2 space-y-2">
      {isLoading ? (
        <p className="text-xs text-gray-400">Loading comments…</p>
      ) : isError ? (
        <p className="text-xs text-gray-400">Couldn&apos;t load comments.</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400">No comments yet — be the first.</p>
      ) : (
        comments.map((c) => {
          const canDelete = user && (user.id === c.user.id || user.id === postAuthorId)
          return (
            <div key={c.id} className="flex items-start gap-2 group">
              <Link href={`/u/${c.user.username}`} className="flex-shrink-0">
                <Avatar src={c.user.avatarUrl} name={c.user.username} size="xs" />
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">
                  <Link
                    href={`/u/${c.user.username}`}
                    className="font-semibold text-gray-900 hover:opacity-70"
                  >
                    @{c.user.username}
                  </Link>{' '}
                  <span className="text-gray-700">{c.body}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(c.createdAt)}</p>
              </div>
              {canDelete && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  disabled={deleteComment.isPending}
                  aria-label="Delete comment"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs px-1 disabled:opacity-40 shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })
      )}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'View more comments'}
        </button>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 pt-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Add a comment…"
          className="flex-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        <button
          type="submit"
          disabled={!text.trim() || addComment.isPending}
          className="text-sm font-semibold text-black hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {addComment.isPending ? '…' : 'Post'}
        </button>
      </form>
    </div>
  )
}
