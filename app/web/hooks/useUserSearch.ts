'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { searchUsers } from '@/lib/api/users.api'
import { ApiError } from '@/lib/api/friends.api'

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2

// ---------------------------------------------------------------------------
// useUserSearch — debounced user search with rate-limit-aware retry
// Components MUST NOT call searchUsers directly — only through this hook.
// ---------------------------------------------------------------------------

export function useUserSearch() {
  const [rawQuery, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Debounce: only fire query after the user pauses typing. We compute the next
  // value and schedule a single timer, so setState never runs synchronously in
  // the effect body (clearing uses a 0ms delay — visually immediate).
  useEffect(() => {
    const trimmed = rawQuery.trim()
    const next = trimmed.length < MIN_QUERY_LENGTH ? '' : trimmed
    const timer = setTimeout(() => setDebouncedQuery(next), next === '' ? 0 : DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawQuery])

  const searchQuery = useQuery({
    queryKey: ['users', 'search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= MIN_QUERY_LENGTH,
    staleTime: 10_000,
    retry: (failureCount, error) => {
      // Do not retry rate-limited requests — wait for user to slow down
      if (error instanceof ApiError && error.status === 429) return false
      return failureCount < 1
    },
  })

  const isRateLimited =
    searchQuery.isError &&
    searchQuery.error instanceof ApiError &&
    searchQuery.error.status === 429

  return {
    query: rawQuery,
    setQuery,
    results: searchQuery.data ?? [],
    isSearching: searchQuery.isFetching,
    isError: searchQuery.isError && !isRateLimited,
    isRateLimited,
    hasQuery: debouncedQuery.length >= MIN_QUERY_LENGTH,
  }
}
