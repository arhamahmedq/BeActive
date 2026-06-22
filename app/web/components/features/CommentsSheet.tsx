'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useComments, useAddComment, useDeleteComment } from '@/hooks/useComments'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { formatRelativeTime } from '@/lib/formatters'
import type { PostCommentDTO } from '@/shared/types/interactions'

// ── "Glass House" comments — a premium glassmorphic bottom-sheet.
// Portaled to <body> because FeedCard's <article> uses `transform`, which would
// otherwise capture our position:fixed child and mis-anchor the sheet.

const SHEET_GLASS = {
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
  boxShadow: '0 -8px 40px rgba(0,0,0,0.16)',
} as const

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function CommentsSheet({
  open,
  onClose,
  postId,
  postAuthorId,
  commentCount,
}: {
  open: boolean
  onClose: () => void
  postId: string
  postAuthorId: string
  commentCount: number
}) {
  // Portal target only exists on the client. The sheet only renders when `open`
  // (false on first paint, after hydration), so this guard can't cause a mismatch.
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetPanel
          onClose={onClose}
          postId={postId}
          postAuthorId={postAuthorId}
          commentCount={commentCount}
        />
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SheetPanel({
  onClose,
  postId,
  postAuthorId,
  commentCount,
}: {
  onClose: () => void
  postId: string
  postAuthorId: string
  commentCount: number
}) {
  const reduce = !!useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll-lock + Esc + minimal focus trap + return focus to the trigger.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <>
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center sm:px-4">
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Comments"
          initial={reduce ? false : { y: '100%' }}
          animate={{ y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: '100%' }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
          style={SHEET_GLASS}
          className="pointer-events-auto flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl outline-none ring-1 ring-white/60 sm:mb-4 sm:max-w-lg sm:rounded-3xl"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-black/[0.06] px-5 pb-3 pt-2">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" aria-hidden />
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-gray-900">
                Comments{' '}
                <span className="font-medium tabular-nums text-gray-400">· {commentCount}</span>
              </h2>
              <button
                onClick={onClose}
                aria-label="Close comments"
                className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 active:scale-90"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05]">
                  <CloseIcon />
                </span>
              </button>
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-1">
            <CommentBody postId={postId} postAuthorId={postAuthorId} reduce={reduce} />
          </div>

          {/* Composer */}
          <Composer postId={postId} listRef={listRef} reduce={reduce} />
        </motion.div>
      </div>
    </>
  )
}

function CommentBody({
  postId,
  postAuthorId,
  reduce,
}: {
  postId: string
  postAuthorId: string
  reduce: boolean
}) {
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useComments(postId, true)
  const { user } = useAuth()
  const comments = data?.pages.flatMap((p) => p.comments) ?? []

  if (isLoading) return <CommentSkeleton />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (comments.length === 0) return <EmptyState />

  return (
    <div className="py-1">
      <AnimatePresence initial={false}>
        {comments.map((c, i) => (
          <CommentRow
            key={c.id}
            comment={c}
            index={i}
            reduce={reduce}
            postId={postId}
            canDelete={!!user && (user.id === c.user.id || user.id === postAuthorId)}
          />
        ))}
      </AnimatePresence>

      {hasNextPage && (
        <button
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto my-2 block rounded-full px-4 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'View more comments'}
        </button>
      )}
    </div>
  )
}

function CommentRow({
  comment,
  index,
  canDelete,
  postId,
  reduce,
}: {
  comment: PostCommentDTO
  index: number
  canDelete: boolean
  postId: string
  reduce: boolean
}) {
  const del = useDeleteComment(postId)
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const bodyRef = useRef<HTMLParagraphElement>(null)

  // Detect overflow so "Read more" only appears when the body is actually clamped.
  useEffect(() => {
    const el = bodyRef.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [comment.body])

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 32, delay: Math.min(index, 6) * 0.04 }
      }
      className="group flex gap-3 border-b border-black/[0.04] py-3 last:border-0"
    >
      <Link href={`/u/${comment.user.username}`} className="shrink-0">
        <Avatar src={comment.user.avatarUrl} name={comment.user.username} size="md" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/u/${comment.user.username}`}
            className="truncate text-[13.5px] font-semibold text-gray-900 hover:opacity-70"
          >
            {comment.user.username}
          </Link>
          <span className="text-gray-300" aria-hidden>
            ·
          </span>
          <span className="shrink-0 text-[11px] font-medium text-gray-400">
            {formatRelativeTime(comment.createdAt)}
          </span>
        </div>

        <p
          ref={bodyRef}
          className={`mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-gray-700 ${
            expanded ? '' : 'line-clamp-5'
          }`}
        >
          {comment.body}
        </p>

        {clamped && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-[12px] font-semibold text-gray-400 transition-colors hover:text-gray-600"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {canDelete && (
        <button
          onClick={() => del.mutate(comment.id)}
          disabled={del.isPending}
          aria-label="Delete comment"
          className="-m-1.5 flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full text-gray-300 opacity-60 transition-all hover:text-red-500 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 active:scale-90 disabled:opacity-30"
        >
          <TrashIcon />
        </button>
      )}
    </motion.div>
  )
}

function Composer({
  postId,
  listRef,
  reduce,
}: {
  postId: string
  listRef: React.RefObject<HTMLDivElement | null>
  reduce: boolean
}) {
  const { user } = useAuth()
  const add = useAddComment(postId)
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const nearLimit = text.length >= 260

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || add.isPending) return
    add.mutate(trimmed, {
      onSuccess: () => {
        setText('')
        listRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
      },
    })
  }

  return (
    <form
      onSubmit={submit}
      className="shrink-0 border-t border-black/[0.06] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      style={{ background: 'rgba(255,255,255,0.85)' }}
    >
      <div className="flex items-center gap-2.5">
        <Avatar src={user?.avatarUrl ?? null} name={user?.username ?? '?'} size="sm" />
        <div className="relative flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            className="w-full rounded-full border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 transition-all focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          {nearLimit && (
            <span className="pointer-events-none absolute -top-5 right-2 text-[10px] font-medium tabular-nums text-gray-400">
              {300 - text.length}
            </span>
          )}
        </div>
        <AnimatePresence>
          {trimmed && (
            <motion.button
              type="submit"
              disabled={add.isPending}
              aria-label="Post comment"
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 26 }}
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm transition-colors hover:bg-brand-600">
                {add.isPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <SendIcon />
                )}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </form>
  )
}

function CommentSkeleton() {
  return (
    <div aria-hidden className="py-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 py-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-28 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-full max-w-[230px] animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <CommentGlyph />
      </div>
      <p className="text-sm font-semibold text-gray-700">No comments yet</p>
      <p className="mt-1 text-xs text-gray-400">Be the first to start the conversation.</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-semibold text-gray-700">Couldn&apos;t load comments</p>
      <button
        onClick={onRetry}
        className="mt-3 rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
      >
        Try again
      </button>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  )
}

function CommentGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={26} height={26} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
