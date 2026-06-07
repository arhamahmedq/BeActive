'use client'
import { useState } from 'react'

interface Props {
  username: string
}

export function ShareProfileButton({ username }: Props) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/u/${username}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `@${username} on BeActive`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      // user dismissed share sheet, or clipboard denied — no-op
    }
  }

  return (
    <button
      onClick={share}
      aria-label="Share profile"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
    >
      <span aria-hidden>↗</span>
      <span>{copied ? 'Copied!' : 'Share'}</span>
    </button>
  )
}
