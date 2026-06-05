'use client'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useComments, useAddComment } from '@/hooks/useComments'

// Lightweight comments under a post card: list + composer. Only mounted when the
// card's comment toggle is open (useComments fires on mount).
export function CommentsSection({ postId }: { postId: string }) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(
    postId,
    true,
  )
  const addComment = useAddComment(postId)
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
        <p className="text-xs text-gray-400">Couldn’t load comments.</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400">No comments yet — be the first.</p>
      ) : (
        comments.map((c) => (
          <p key={c.id} className="text-sm leading-snug">
            <Link href={`/u/${c.user.username}`} className="font-semibold text-gray-900 hover:opacity-70">
              @{c.user.username}
            </Link>{' '}
            <span className="text-gray-700">{c.body}</span>
          </p>
        ))
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
