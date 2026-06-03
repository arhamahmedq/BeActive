'use client'
import { useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { useFeed } from '@/hooks/useFeed'
import { Button } from '@/components/ui/Button'
import { StreakWidget } from '@/components/features/StreakWidget'
import { StreakDebugPanel } from '@/components/features/StreakDebugPanel'
import { FeedCard } from '@/components/features/FeedCard'

const DEBUG = process.env.NEXT_PUBLIC_STREAK_DEBUG === 'true'

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-9 w-9 rounded-full bg-gray-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-gray-100 rounded" />
              <div className="h-2.5 w-16 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="w-full aspect-square bg-gray-100" />
          <div className="px-4 py-3">
            <div className="h-3 w-20 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FeedPage() {
  const { user, isLoading: authLoading, signOut } = useAuth()
  const { data: streak, isLoading: streakLoading } = useStreak()
  const {
    data,
    isLoading: feedLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed()

  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (authLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse h-40" />
        ))}
      </div>
    )
  }

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? []
  const firstPage = data?.pages[0]
  const emptyReason = firstPage?.emptyReason

  let feedContent: React.ReactNode

  if (feedLoading) {
    feedContent = <FeedSkeleton />
  } else if (isError) {
    feedContent = (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-3">
        <p className="text-sm text-gray-500">Couldn&apos;t load your feed.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  } else if (allPosts.length === 0) {
    if (emptyReason === 'NO_CONNECTIONS') {
      feedContent = (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-3">
          <p className="text-sm font-medium text-gray-700">Add friends to see their workouts!</p>
          <p className="text-xs text-gray-400">
            Connect with people to build accountability together.
          </p>
          <p className="text-xs text-gray-300">Friends coming soon.</p>
        </div>
      )
    } else {
      feedContent = (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-2">
          <p className="text-sm font-medium text-gray-700">No recent workouts yet</p>
          <p className="text-xs text-gray-400">
            When you or your friends post, they&apos;ll show up here.
          </p>
        </div>
      )
    }
  } else {
    feedContent = (
      <div className="space-y-4">
        {allPosts.map((post) => (
          <FeedCard key={post.id} post={post} />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} />

        {isFetchingNextPage && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-2.5 w-16 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="w-full aspect-square bg-gray-100" />
          </div>
        )}

        {!hasNextPage && (
          <p className="text-center text-xs text-gray-300 py-4">You&apos;re all caught up</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Your Feed</h1>
          {user && <p className="text-sm text-gray-500">Hi, @{user.username}</p>}
        </div>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>

      <StreakWidget streak={streak ?? null} isLoading={streakLoading} />

      {DEBUG && <StreakDebugPanel streak={streak ?? null} />}

      {feedContent}
    </div>
  )
}
