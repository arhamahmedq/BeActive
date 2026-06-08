'use client'
import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
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
        <div key={i} className="glass-card rounded-2xl overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-9 w-9 rounded-full bg-gray-200/80" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-gray-200/80 rounded" />
              <div className="h-2.5 w-16 bg-gray-200/80 rounded" />
            </div>
          </div>
          <div className="w-full aspect-square bg-gray-200/80" />
          <div className="px-4 py-3">
            <div className="h-3 w-20 bg-gray-200/80 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FeedPage() {
  const { user, isLoading: authLoading } = useAuth()
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
  const scrollRef = useRef<HTMLDivElement>(null)

  // Pull-to-refresh: track touch start position, trigger refetch when pulled > 80px
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0]?.clientY ?? 0
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === 0) return
    const delta = (e.touches[0]?.clientY ?? 0) - touchStartY.current
    if (delta > 0 && window.scrollY === 0) {
      setPullY(Math.min(delta * 0.5, 64))
    }
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= 48 && !isRefreshing) {
      setIsRefreshing(true)
      await refetch()
      setIsRefreshing(false)
    }
    setPullY(0)
    touchStartY.current = 0
  }, [pullY, isRefreshing, refetch])

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

  function getGreeting(): string {
    const h = new Date().getHours()
    if (h < 5)  return 'Still up?'
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  function getMotivation(): string {
    const h = new Date().getHours()
    if (h < 9)  return 'Start the day right.'
    if (h < 14) return 'Keep the chain alive.'
    if (h < 19) return "Don't end the day without it."
    return 'One post before midnight.'
  }

  if (authLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card rounded-2xl animate-pulse h-40" />
        ))}
      </div>
    )
  }

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? []
  const firstPage = data?.pages[0]
  const emptyReason = firstPage?.emptyReason

  let feedContent: ReactNode

  if (feedLoading) {
    feedContent = <FeedSkeleton />
  } else if (isError) {
    feedContent = (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <p className="text-sm text-gray-500">Couldn&apos;t load your feed.</p>
        <Button variant="ghost" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  } else if (allPosts.length === 0) {
    if (emptyReason === 'NO_CONNECTIONS') {
      feedContent = (
        <div className="glass-card rounded-2xl p-10 text-center space-y-3">
          <p className="text-4xl mb-2" aria-hidden>👥</p>
          <p className="text-base font-semibold text-gray-800">Find friends — grow your streak together</p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            Connect with people to build accountability and see their workouts here.
          </p>
          <Link
            href="/friends"
            className="inline-flex items-center gap-1.5 bg-black text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors mt-2"
          >
            Find friends →
          </Link>
        </div>
      )
    } else {
      feedContent = (
        <div className="glass-card rounded-2xl p-10 text-center space-y-2">
          <p className="text-4xl mb-2" aria-hidden>🏋️</p>
          <p className="text-base font-semibold text-gray-800">No recent workouts yet</p>
          <p className="text-sm text-gray-500">
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
          <div className="glass-card rounded-2xl overflow-hidden animate-pulse">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="h-9 w-9 rounded-full bg-gray-200/80" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 bg-gray-200/80 rounded" />
                <div className="h-2.5 w-16 bg-gray-200/80 rounded" />
              </div>
            </div>
            <div className="w-full aspect-square bg-gray-200/80" />
          </div>
        )}

        {!hasNextPage && (
          <p className="text-center text-xs text-gray-400 py-4">You&apos;re all caught up</p>
        )}
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="space-y-5"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullY > 0 || isRefreshing) && (
        <div
          className="flex items-center justify-center transition-all duration-150 overflow-hidden"
          style={{ height: isRefreshing ? 40 : pullY }}
        >
          <div className={`w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent ${isRefreshing ? 'animate-spin' : ''}`} />
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          {user
            ? `${getGreeting()}, ${(user.displayName?.split(' ')[0]) || user.username}`
            : 'Your Feed'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{getMotivation()}</p>
      </div>

      <StreakWidget streak={streak ?? null} isLoading={streakLoading} />

      {DEBUG && <StreakDebugPanel streak={streak ?? null} />}

      {feedContent}
    </div>
  )
}
