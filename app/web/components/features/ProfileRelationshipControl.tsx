'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useProfileRelationship } from '@/hooks/useProfileRelationship'
import type { RelationshipState } from '@/shared/types/profile'

interface Props {
  username: string
  profileId: string
  relationship: RelationshipState
  friendshipId: string | null
  className?: string
}

const pill =
  'inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-full transition-colors flex-shrink-0 disabled:opacity-50'

export function ProfileRelationshipControl({ username, profileId, relationship, friendshipId, className = '' }: Props) {
  const { add, accept, decline, cancel, remove, block, unblock } = useProfileRelationship(username)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  if (relationship === 'self') return null

  // ── Blocked by viewer: minimal view with unblock ──────────────────────────
  if (relationship === 'blocked_by_viewer') {
    return (
      <button
        onClick={() => unblock.mutate(profileId)}
        disabled={unblock.isPending}
        className={`${pill} bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50`}
      >
        {unblock.isPending ? 'Unblocking…' : 'Unblock'}
      </button>
    )
  }

  // ── Block confirmation overlay ────────────────────────────────────────────
  if (confirmBlock) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => { block.mutate(profileId); setConfirmBlock(false) }}
          disabled={block.isPending}
          className={`${pill} bg-red-50 text-red-600 hover:bg-red-100`}
        >
          {block.isPending ? 'Blocking…' : 'Block @' + username}
        </button>
        <button onClick={() => setConfirmBlock(false)} className={`${pill} text-gray-400 hover:text-gray-700`}>
          Cancel
        </button>
      </div>
    )
  }

  // ── Remove-friend confirmation ────────────────────────────────────────────
  if (confirmRemove) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => friendshipId && remove.mutate(friendshipId)}
          disabled={!friendshipId || remove.isPending}
          className={`${pill} bg-red-50 text-red-600 hover:bg-red-100`}
        >
          {remove.isPending ? 'Removing…' : 'Remove friend'}
        </button>
        <button onClick={() => setConfirmRemove(false)} className={`${pill} text-gray-400 hover:text-gray-700`}>
          Cancel
        </button>
      </div>
    )
  }

  // ── Primary action per state + ⋯ more menu (block) ───────────────────────
  let primaryAction: React.ReactNode

  if (relationship === 'none') {
    primaryAction = (
      <Button variant="brand" onClick={() => add.mutate(profileId)} isLoading={add.isPending} className="rounded-full">
        Add friend
      </Button>
    )
  } else if (relationship === 'outgoing') {
    primaryAction = (
      <button
        onClick={() => friendshipId && cancel.mutate(friendshipId)}
        disabled={!friendshipId || cancel.isPending}
        title="Cancel request"
        className={`${pill} bg-gray-100 text-gray-500 hover:bg-gray-200`}
      >
        {cancel.isPending ? 'Cancelling…' : 'Requested ✕'}
      </button>
    )
  } else if (relationship === 'incoming') {
    primaryAction = (
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="brand"
          onClick={() => friendshipId && accept.mutate(friendshipId)}
          isLoading={accept.isPending}
          disabled={!friendshipId}
          className="rounded-full"
        >
          Accept
        </Button>
        <button
          onClick={() => friendshipId && decline.mutate(friendshipId)}
          disabled={!friendshipId || decline.isPending}
          className={`${pill} bg-gray-100 text-gray-500 hover:bg-gray-200`}
        >
          {decline.isPending ? '…' : 'Decline'}
        </button>
      </div>
    )
  } else {
    // friends
    primaryAction = (
      <button
        onClick={() => setConfirmRemove(true)}
        className={`${pill} bg-gray-100 text-gray-700 hover:bg-gray-200`}
      >
        ✓ Friends
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-2 flex-shrink-0 ${className}`}>
      {primaryAction}

      {/* ⋯ more menu — block lives here (destructive, one step removed) */}
      <div className="relative">
        <button
          onClick={() => setMoreOpen(v => !v)}
          aria-label="More options"
          className={`${pill} bg-gray-100 text-gray-500 hover:bg-gray-200 px-2.5`}
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden>
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        </button>

        {moreOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} aria-hidden />
            <div
              className="absolute right-0 top-10 z-20 w-40 bg-white rounded-xl py-1.5 animate-pop"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}
            >
              <button
                onClick={() => { setMoreOpen(false); setConfirmBlock(true) }}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                Block @{username}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
