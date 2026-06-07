'use client'
import { useState, useCallback } from 'react'

const STORAGE_KEY = 'beactive:saved:v1'

export interface SavedPost {
  id: string
  imageUrl: string
  caption: string | null
  username: string
  avatarUrl: string | null
  createdAt: string
}

function readStorage(): SavedPost[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedPost[]) : []
  } catch {
    return []
  }
}

function writeStorage(posts: SavedPost[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
  } catch {
    // Storage full or denied — silently ignore
  }
}

export function useSavedPosts() {
  const [saved, setSaved] = useState<SavedPost[]>(readStorage)

  const isSaved = useCallback((postId: string) => saved.some(p => p.id === postId), [saved])

  const savePost = useCallback((post: SavedPost) => {
    setSaved(prev => {
      if (prev.some(p => p.id === post.id)) return prev
      const next = [post, ...prev]
      writeStorage(next)
      return next
    })
  }, [])

  const unsavePost = useCallback((postId: string) => {
    setSaved(prev => {
      const next = prev.filter(p => p.id !== postId)
      writeStorage(next)
      return next
    })
  }, [])

  return { saved, isSaved, savePost, unsavePost }
}
