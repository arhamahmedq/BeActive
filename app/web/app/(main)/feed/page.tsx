'use client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export default function FeedPage() {
  const { user, isLoading, signOut } = useAuth()

  if (isLoading) {
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
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400 text-sm">Feed coming in Slice 5.</p>
        <p className="text-gray-300 text-xs mt-1">Add friends to see their workouts.</p>
      </div>
    </div>
  )
}
