'use client'
import { useState } from 'react'

interface Props {
  username: string
  className?: string
}

export function ShareProfileButton({ username, className = '' }: Props) {
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
      // user dismissed share sheet or clipboard denied — no-op
    }
  }

  return (
    <button
      onClick={share}
      aria-label="Share profile"
      className={`inline-flex items-center justify-center gap-1.5 text-sm font-semibold h-9 px-4 rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200 active:scale-[0.97] transition-all ${className}`}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="2 8 6 12 14 4" />
          </svg>
          <span className="text-brand-700">Copied!</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="3" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="12" cy="13" r="1.5" />
            <line x1="5.4" y1="7.2" x2="10.6" y2="3.8" />
            <line x1="5.4" y1="8.8" x2="10.6" y2="12.2" />
          </svg>
          Share profile
        </>
      )}
    </button>
  )
}
