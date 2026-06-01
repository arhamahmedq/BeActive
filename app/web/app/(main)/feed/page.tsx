'use client'
import { useAuth } from '@/hooks/useAuth'
import { useStreak } from '@/hooks/useStreak'
import { Button } from '@/components/ui/Button'
import { StreakWidget } from '@/components/features/StreakWidget'
import { StreakDebugPanel } from '@/components/features/StreakDebugPanel'

const DEBUG = process.env.NEXT_PUBLIC_STREAK_DEBUG === 'true'

export default function FeedPage() {
  const { user, isLoading: authLoading, signOut } = useAuth()
  const { data: streak, isLoading: streakLoading } = useStreak()

  if (authLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse h-40" />
        ))}
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

      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400 text-sm">Feed coming in Slice 5.</p>
        <p className="text-gray-300 text-xs mt-1">Add friends to see their workouts.</p>
      </div>
    </div>
  )
}
