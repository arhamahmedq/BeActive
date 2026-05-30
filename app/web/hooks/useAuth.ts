'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/shared/types/auth'

export function useAuth() {
  const { user, isLoading, setUser, setLoading, clearUser } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    fetch('/api/auth/session')
      .then((res) => {
        if (!res.ok) {
          if (!cancelled) clearUser()
          return
        }
        return res.json()
      })
      .then((data: { user: AuthUser } | undefined) => {
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
