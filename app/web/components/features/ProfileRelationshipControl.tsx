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
}

const pill =
  'inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-full transition-colors flex-shrink-0 disabled:opacity-50'

// The single source of truth for modifying the social graph from /u/[username].
// One primary action per relationship state; unfriend is a click-to-confirm
// reveal (no dropdown). All mutations are optimistic via useProfileRelationship.
export function ProfileRelationshipControl({ username, profileId, relationship, friendshipId }: Props) {
  const { add, accept, decline, cancel, remove } = useProfileRelationship(username)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (relationship === 'self') return null

  if (relationship === 'none') {
    return (
      <Button variant="brand" onClick={() => add.mutate(profileId)} isLoading={add.isPending} className="rounded-full">
        Add friend
      </Button>
    )
  }

  if (relationship === 'outgoing') {
    // Tapping "Requested" cancels the outgoing request (Instagram pattern).
    return (
      <button
        onClick={() => friendshipId && cancel.mutate(friendshipId)}
        disabled={!friendshipId || cancel.isPending}
        title="Cancel request"
        className={`${pill} bg-gray-100 text-gray-500 hover:bg-gray-200`}
      >
        {cancel.isPending ? 'Cancelling…' : 'Requested ✕'}
      </button>
    )
  }

  if (relationship === 'incoming') {
    return (
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
  }

  // friends
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
  return (
    <button
      onClick={() => setConfirmRemove(true)}
      className={`${pill} bg-gray-100 text-gray-700 hover:bg-gray-200`}
    >
      ✓ Friends
    </button>
  )
}
