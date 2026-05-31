'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/shared/types/auth'

export function useAuth() {
  const { user, isLoading, setUser, setLoading, clearUser } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // Skip the round-trip if we already have a user in the Zustand store.
    // This prevents a skeleton flash on every internal navigation while the
    // store remains hydrated in memory.
    if (user !== null) return

    let cancelled = false
    setLoading(true)

    fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) clearUser()
          return
        }
        const data = (await res.json()) as { user: AuthUser }
        if (!cancelled && data?.user) setUser(data.user)
      })
      .catch(() => {
        if (!cancelled) clearUser()
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearUser()
    router.push('/login')
  }

  return { user, isLoading, signOut }
}
