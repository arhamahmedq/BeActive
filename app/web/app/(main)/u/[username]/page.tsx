'use client'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useProfile, useProfilePosts } from '@/hooks/useProfile'
import { ApiError } from '@/lib/api/friends.api'
import { Button } from '@/components/ui/Button'
import { ProfileRelationshipControl } from '@/components/features/ProfileRelationshipControl'
import { ProfileAvatar } from '@/components/features/ProfileAvatar'
import { EditProfile } from '@/components/features/EditProfile'
import { ShareProfileButton } from '@/components/features/ShareProfileButton'

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-start gap-4">
          <ProfileAvatar
            name={profile.displayName || profile.username}
            avatarUrl={profile.avatarUrl}
            isSelf={relationship === 'self'}
          />
          <div className="flex-1 min-w-0 pt-1">
            {profile.displayName && (
              <p className="text-lg font-semibold text-gray-900 truncate">{profile.displayName}</p>
            )}
            <p className="text-sm text-gray-500 truncate">@{profile.username}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareProfileButton username={username} />
            <ProfileRelationshipControl
              username={username}
              profileId={profile.id}
              relationship={relationship!}
              friendshipId={data.friendshipId}
            />
          </div>
        </div>

        {profile.bio && <p className="text-sm text-gray-700 mt-4">{profile.bio}</p>}

        <div className="flex items-center gap-5 mt-4 text-sm">
          <Stat label="Streak" value={profile.streak.current} suffix="🔥" />
          <Stat label="Best" value={profile.streak.best} />
          <Stat label="Friends" value={profile.friendCount} />
          <Stat label="Workouts" value={profile.postCount} />
        </div>
      </div>

      {/* Owner-only profile info editing (avatar edit lives in the header). */}
      {relationship === 'self' && (
        <EditProfile
          username={profile.username}
          displayName={profile.displayName}
          bio={profile.bio}
        />
      )}

      {/* Posts grid (friends/self) or gated message — the action lives in the header */}
      {canViewPosts ? (
        <PostsGrid query={posts} username={profile.username} />
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

// Profile = discovery GRID (Instagram-style): thumbnails in rows, many posts at a
// glance, NOT a feed. Tapping a tile opens the dedicated post viewer
// (/u/[username]/p/[id]) where engagement + vertical browsing live.
function PostsGrid({
  query,
  username,
}: {
  query: ReturnType<typeof useProfilePosts>
  username: string
}) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = query

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-square bg-gray-100 animate-pulse" />
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
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1">
        {allPosts.map((post) => (
          <Link
            key={post.id}
            href={`/u/${username}/p/${post.id}`}
            className="group relative block aspect-square overflow-hidden bg-gray-50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt={post.caption ?? `${username}'s workout`}
              className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
            />
            {(post.likeCount > 0 || post.commentCount > 0) && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/50 to-transparent px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {post.likeCount > 0 && <span>♥ {post.likeCount}</span>}
                {post.commentCount > 0 && <span>💬 {post.commentCount}</span>}
              </div>
            )}
          </Link>
        ))}
      </div>
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
