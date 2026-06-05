'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useProfile, useProfilePosts } from '@/hooks/useProfile'
import { ApiError } from '@/lib/api/friends.api'
import { Button } from '@/components/ui/Button'
import { ProfileRelationshipControl } from '@/components/features/ProfileRelationshipControl'
import { FeedCard } from '@/components/features/FeedCard'

export default function ProfilePage() {
  const params = useParams<{ username: string }>()
  const username = params?.username ?? ''

  const { data, isLoading, isError, error } = useProfile(username)

  const relationship = data?.relationship
  const canViewPosts = relationship === 'self' || relationship === 'friends'
  const posts = useProfilePosts(username, !!data && canViewPosts)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse h-40" />
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-2">
        <p className="text-sm font-medium text-gray-700">
          {notFound ? 'User not found' : 'Couldn’t load this profile'}
        </p>
        <Link href="/friends" className="text-xs text-gray-400 hover:text-black">
          ← Back to friends
        </Link>
      </div>
    )
  }

  const { profile } = data
  const initial = (profile.displayName || profile.username).charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center text-xl font-semibold text-gray-500">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="flex-1 min-w-0">
            {profile.displayName && (
              <p className="text-lg font-semibold text-gray-900 truncate">{profile.displayName}</p>
            )}
            <p className="text-sm text-gray-500 truncate">@{profile.username}</p>
          </div>
          <ProfileRelationshipControl
            username={username}
            profileId={profile.id}
            relationship={relationship!}
            friendshipId={data.friendshipId}
          />
        </div>

        {profile.bio && <p className="text-sm text-gray-700 mt-4">{profile.bio}</p>}

        <div className="flex items-center gap-5 mt-4 text-sm">
          <Stat label="Streak" value={profile.streak.current} suffix="🔥" />
          <Stat label="Best" value={profile.streak.best} />
          <Stat label="Friends" value={profile.friendCount} />
          <Stat label="Workouts" value={profile.postCount} />
        </div>
      </div>

      {/* Posts grid (friends/self) or gated message — the action lives in the header */}
      {canViewPosts ? (
        <PostsList query={posts} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-2">
          <p className="text-2xl" aria-hidden>
            🔒
          </p>
          <p className="text-sm font-medium text-gray-700">Add friend to see workouts</p>
          <p className="text-xs text-gray-400">
            {relationship === 'outgoing'
              ? 'Your friend request is pending.'
              : relationship === 'incoming'
                ? 'They’ve requested you — accept above to connect.'
                : 'Their workouts are visible to friends only.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-semibold text-gray-900">{value}</span>
      {suffix && <span aria-hidden>{suffix}</span>}
      <span className="text-gray-400">{label}</span>
    </div>
  )
}

// Profile posts render through the SAME FeedCard as the main feed, so like /
// comment / share behave identically — one source of truth, no duplicated UI.
function PostsList({ query }: { query: ReturnType<typeof useProfilePosts> }) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = query

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-72 animate-pulse" />
        ))}
      </div>
    )
  }
  if (isError) {
    return <p className="text-center text-sm text-gray-400 py-8">Couldn’t load posts.</p>
  }

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? []
  if (allPosts.length === 0) {
    return <p className="text-center text-sm text-gray-400 py-8">No workouts yet.</p>
  }

  return (
    <div className="space-y-4">
      {allPosts.map((post) => (
        <FeedCard key={post.id} post={post} />
      ))}
      {hasNextPage && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => fetchNextPage()} isLoading={isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
