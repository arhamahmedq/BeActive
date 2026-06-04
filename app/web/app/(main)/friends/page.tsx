'use client'
import { useState } from 'react'
import { useFriends } from '@/hooks/useFriends'
import { useUserSearch } from '@/hooks/useUserSearch'
import { FriendsList } from '@/components/features/FriendsList'
import { FriendRequests } from '@/components/features/FriendRequests'
import { UserSearch } from '@/components/features/UserSearch'

export default function FriendsPage() {
  const {
    friends,
    incoming,
    outgoing,
    isLoading,
    isError,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  } = useFriends()

  const search = useUserSearch()

  // Track which specific user IDs have in-flight mutations for per-button loading states
  const [removingFriendshipId, setRemovingFriendshipId] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [sendingUserId, setSendingUserId] = useState<string | null>(null)

  const friendUserIds = new Set(friends.map((f) => f.id))
  const outgoingUserIds = new Set(outgoing.map((e) => e.user.id))

  function handleRemove(friendshipId: string) {
    setRemovingFriendshipId(friendshipId)
    removeFriend.mutate(friendshipId, {
      onSettled: () => setRemovingFriendshipId(null),
    })
  }

  function handleAccept(friendshipId: string) {
    setAcceptingId(friendshipId)
    acceptRequest.mutate(friendshipId, {
      onSettled: () => setAcceptingId(null),
    })
  }

  function handleReject(friendshipId: string) {
    setRejectingId(friendshipId)
    rejectRequest.mutate(friendshipId, {
      onSettled: () => setRejectingId(null),
    })
  }

  function handleSendRequest(userId: string) {
    setSendingUserId(userId)
    sendRequest.mutate(userId, {
      onSettled: () => setSendingUserId(null),
    })
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Friends</h1>
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">Couldn&apos;t load your friends. Try refreshing.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Friends</h1>

      {/* User Search */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">Find people</h2>
        <UserSearch
          query={search.query}
          onQueryChange={search.setQuery}
          results={search.results}
          isSearching={search.isSearching}
          isRateLimited={search.isRateLimited}
          hasQuery={search.hasQuery}
          friendUserIds={friendUserIds}
          sentUserIds={outgoingUserIds}
          onSendRequest={handleSendRequest}
          sendingUserId={sendingUserId}
        />
      </section>

      {/* Pending Requests — only shown when there are any */}
      {(incoming.length > 0 || outgoing.length > 0 || isLoading) && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-700">Requests</h2>
          <FriendRequests
            incoming={incoming}
            outgoing={outgoing}
            isLoading={isLoading}
            acceptingId={acceptingId}
            rejectingId={rejectingId}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        </section>
      )}

      {/* Friends List */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-700">
          Your friends{!isLoading && friends.length > 0 ? ` (${friends.length})` : ''}
        </h2>
        <FriendsList
          friends={friends}
          isLoading={isLoading}
          removingFriendshipId={removingFriendshipId}
          onRemove={handleRemove}
        />
      </section>
    </div>
  )
}
