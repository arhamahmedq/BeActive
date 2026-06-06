'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/shared/types/auth'

// Module-level in-flight guard. When two components (e.g. layout + page) mount
// simultaneously with user === null, only the first one fires the network request;
// the second skips and the Zustand subscriber picks up the result when it lands.
// Reset to null on completion so a re-mount after clearUser() re-fetches.
let _sessionFetch: Promise<void> | null = null

export function useAuth() {
  const { user, isLoading, setUser, setLoading, clearUser } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    // Skip the round-trip if we already have a user in the Zustand store.
    if (user !== null) return

    // Skip if another component already dispatched the request.
    if (_sessionFetch !== null) return

    let cancelled = false
    setLoading(true)

    _sessionFetch = fetch('/api/auth/session')
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) clearUser()
          return
        }
        const data = (await res.json()) as { user: AuthUser }
        if (!cancelled && data?.user) setUser(data.user)
        else if (!cancelled) clearUser()
      })
      .catch(() => {
        if (!cancelled) clearUser()
      })
      .finally(() => {
        _sessionFetch = null
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    clearUser()
    queryClient.clear()
    router.push('/login')
  }

  return { user, isLoading, signOut }
}
