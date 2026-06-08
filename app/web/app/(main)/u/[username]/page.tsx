'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useProfile, useProfilePosts } from '@/hooks/useProfile'
import { ApiError } from '@/lib/api/friends.api'
import { ProfileRelationshipControl } from '@/components/features/ProfileRelationshipControl'
import { ProfileAvatar } from '@/components/features/ProfileAvatar'
import { EditProfile } from '@/components/features/EditProfile'
import { ShareProfileButton } from '@/components/features/ShareProfileButton'
import { StreakPlantCard } from '@/components/features/StreakPlantCard'
import { useSavedPosts } from '@/hooks/useSavedPosts'

type ProfileTab = 'posts' | 'saved'

// ── Stat column (Instagram pattern: big number, small label) ─────────────────
function StatCol({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[19px] font-bold text-gray-900 tabular-nums leading-tight">
        {value}
      </span>
      <span className="text-[12px] text-gray-400 leading-none">{label}</span>
    </div>
  )
}

export default function ProfilePage() {
  const params = useParams<{ username: string }>()
  const username = params?.username ?? ''
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts')

  const { data, isLoading, isError, error } = useProfile(username)
  const { saved } = useSavedPosts()

  const relationship = data?.relationship
  const canViewPosts = relationship === 'self' || relationship === 'friends'
  const isSelf = relationship === 'self'
  const isBlockedByViewer = relationship === 'blocked_by_viewer'
  const posts = useProfilePosts(username, !!data && canViewPosts)

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
          <div className="flex items-center gap-5 px-4 pt-5 pb-3">
            <div className="h-[82px] w-[82px] rounded-full bg-gray-100 flex-shrink-0" />
            <div className="flex-1 flex justify-around">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="h-5 w-8 bg-gray-100 rounded" />
                  <div className="h-3 w-12 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <div className="h-4 w-28 bg-gray-100 rounded" />
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
          <div className="mx-4 mb-4 h-16 bg-gray-100 rounded-2xl" />
          <div className="flex gap-2 px-4 pb-4">
            <div className="flex-1 h-9 bg-gray-100 rounded-xl" />
            <div className="h-9 w-28 bg-gray-100 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-sm animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error / not found ────────────────────────────────────────────────────────
  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-2">
        <p className="text-sm font-medium text-gray-700">
          {notFound ? 'User not found' : "Couldn't load this profile"}
        </p>
        <Link href="/friends" className="text-xs text-gray-400 hover:text-black">
          ← Back to friends
        </Link>
      </div>
    )
  }

  const { profile } = data

  return (
    <div className="space-y-4">
      {/* ── Profile card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Row 1: Avatar (left) + Stats (right) — Instagram layout */}
        <div className="flex items-center gap-5 px-4 pt-5 pb-0">
          <ProfileAvatar
            name={profile.displayName || profile.username}
            avatarUrl={profile.avatarUrl}
            isSelf={isSelf}
          />
          {/* Stats: Workouts · Friends · Best */}
          <div className="flex-1 flex justify-around min-w-0 pb-1">
            <StatCol label="Workouts" value={profile.postCount} />
            <StatCol label="Friends"  value={profile.friendCount} />
            <StatCol label="Best"     value={profile.streak.best} />
          </div>
        </div>

        {/* Row 2: Name + bio */}
        <div className="px-4 pt-3 pb-0">
          <p className="text-[15px] font-bold text-gray-900 leading-tight">
            {profile.displayName || profile.username}
          </p>
          <p className="text-sm text-gray-400">@{profile.username}</p>
          {profile.bio && (
            <p className="text-sm text-gray-700 mt-2 leading-relaxed">{profile.bio}</p>
          )}
        </div>

        {/* Row 3: Streak plant hero */}
        <div className="px-4 pt-3">
          <StreakPlantCard current={profile.streak.current} />
        </div>

        {/* Row 4: Action buttons */}
        {relationship !== 'self' ? (
          // Non-self: full-width relationship control + share button
          <div className="flex items-center gap-2 px-4 pt-3 pb-4">
            <div className="flex-1 min-w-0">
              <ProfileRelationshipControl
                username={username}
                profileId={profile.id}
                relationship={relationship!}
                friendshipId={data.friendshipId}
                className="w-full"
              />
            </div>
            <ShareProfileButton username={username} />
          </div>
        ) : (
          // Self: Edit profile (flex-1) + Share profile
          <div className="flex items-center gap-2 px-4 pt-3 pb-4">
            <EditProfile
              username={profile.username}
              displayName={profile.displayName}
              bio={profile.bio}
              triggerClass="flex-1"
            />
            <ShareProfileButton username={username} />
          </div>
        )}

        {/* Inline edit form — only visible when EditProfile is open */}
        {/* (EditProfile manages its own open state; form renders instead of button) */}
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      {isSelf && (
        <div className="flex border-b border-gray-100 bg-white rounded-t-xl overflow-hidden">
          {(['posts', 'saved'] as ProfileTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-[13px] font-semibold capitalize transition-colors relative ${
                activeTab === tab ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-brand-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Posts grid ────────────────────────────────────────────────────── */}
      {activeTab === 'posts' && (
        canViewPosts ? (
          <PostsGrid query={posts} username={profile.username} />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-2">
            <p className="text-2xl" aria-hidden>{isBlockedByViewer ? '🚫' : '🔒'}</p>
            <p className="text-sm font-medium text-gray-700">
              {isBlockedByViewer
                ? `You've blocked @${profile.username}`
                : 'Add friend to see workouts'}
            </p>
            <p className="text-xs text-gray-400">
              {isBlockedByViewer
                ? 'Unblock to reconnect and see their workouts.'
                : relationship === 'outgoing'
                  ? 'Your friend request is pending.'
                  : relationship === 'incoming'
                    ? "They've requested you — accept above to connect."
                    : 'Their workouts are visible to friends only.'}
            </p>
          </div>
        )
      )}

      {/* ── Saved grid (own profile only) ──────────────────────────────────── */}
      {activeTab === 'saved' && isSelf && (
        <SavedGrid posts={saved} />
      )}
    </div>
  )
}

// ── Saved grid ───────────────────────────────────────────────────────────────
function SavedGrid({ posts }: { posts: ReturnType<typeof useSavedPosts>['saved'] }) {
  if (posts.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-2xl" aria-hidden>🔖</p>
        <p className="text-sm font-medium text-gray-700">No saved posts yet</p>
        <p className="text-xs text-gray-400">Tap the bookmark on any post to save it here.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/p/${post.id}`}
          className="group relative block aspect-square overflow-hidden bg-gray-50 rounded-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.imageUrl}
            alt={post.caption ?? `${post.username}'s workout`}
            className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="text-[10px] text-white font-medium truncate">@{post.username}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ── Posts grid ───────────────────────────────────────────────────────────────
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
      <div className="grid grid-cols-3 gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square bg-gray-100 animate-pulse rounded-sm" />
        ))}
      </div>
    )
  }
  if (isError) {
    return <p className="text-center text-sm text-gray-400 py-8">Couldn&apos;t load posts.</p>
  }

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? []
  if (allPosts.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-2xl" aria-hidden>🏋️</p>
        <p className="text-sm font-medium text-gray-700">No workouts yet</p>
        <p className="text-xs text-gray-400">Post your first workout to start your streak.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-0.5">
        {allPosts.map((post) => (
          <Link
            key={post.id}
            href={`/u/${username}/p/${post.id}`}
            className="group relative block aspect-square overflow-hidden bg-gray-50 rounded-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt={post.caption ?? `${username}'s workout`}
              className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
            />
            {(post.likeCount > 0 || post.commentCount > 0) && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/40 text-[13px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {post.likeCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span aria-hidden>♥</span> {post.likeCount}
                  </span>
                )}
                {post.commentCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span aria-hidden>💬</span> {post.commentCount}
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
      {hasNextPage && (
        <div className="text-center">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors py-2 disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
