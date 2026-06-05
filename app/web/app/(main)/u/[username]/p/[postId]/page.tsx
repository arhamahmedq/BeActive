'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useProfilePosts } from '@/hooks/useProfile'
import { ProfilePostCard } from '@/components/features/ProfilePostCard'

// Dedicated post viewer (Instagram-style): tapping a grid tile opens the creator's
// posts as a vertical scroll, positioned at the tapped post — then you keep
// scrolling through their other posts without returning to the grid. Engagement
// (like/comment/share) is the SHARED PostEngagementBar inside ProfilePostCard.
// Same data source as the grid (useProfilePosts) → no duplicate fetching logic.
export default function ProfilePostViewer() {
  const params = useParams<{ username: string; postId: string }>()
  const username = params?.username ?? ''
  const targetId = params?.postId ?? ''

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useProfilePosts(username, true)

  const posts = data?.pages.flatMap((p) => p.posts) ?? []
  const targetLoaded = posts.some((p) => p.id === targetId)

  const targetRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)

  // 1) Keep loading pages until the tapped post is in the loaded set (it may be
  //    deep in the creator's history).
  useEffect(() => {
    if (scrolled || targetLoaded) return
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [scrolled, targetLoaded, hasNextPage, isFetchingNextPage, fetchNextPage])

  // 2) Once the target post is in the DOM, scroll to it — once.
  useEffect(() => {
    if (scrolled || !targetLoaded || !targetRef.current) return
    targetRef.current.scrollIntoView({ block: 'start' })
    setScrolled(true)
  }, [scrolled, targetLoaded])

  // 3) Infinite scroll downward (continue through the creator's posts).
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="space-y-4">
      <Link
        href={`/u/${username}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-black"
      >
        ← @{username}
      </Link>

      {isLoading && <div className="bg-white rounded-xl border border-gray-100 h-80 animate-pulse" />}
      {isError && (
        <p className="text-center text-sm text-gray-400 py-8">Couldn’t load posts.</p>
      )}
      {!isLoading && !isError && posts.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">No workouts yet.</p>
      )}

      {posts.map((post) => (
        <div key={post.id} ref={post.id === targetId ? targetRef : undefined} className="scroll-mt-20">
          <ProfilePostCard post={post} />
        </div>
      ))}

      <div ref={sentinelRef} />
      {isFetchingNextPage && <p className="text-center text-xs text-gray-300 py-2">Loading…</p>}
      {!hasNextPage && posts.length > 0 && (
        <p className="text-center text-xs text-gray-300 py-4">You’re all caught up</p>
      )}
    </div>
  )
}
