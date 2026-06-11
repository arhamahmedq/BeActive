'use client'
import { useState, useCallback } from 'react'

interface StoryShareButtonProps {
  postId: string
  streakCount: number | null
  workoutType: string | undefined
  isPersonalBest: boolean
}

type ShareState = 'idle' | 'generating' | 'success' | 'downloaded' | 'error'

const ERROR_MESSAGES: Record<number, string> = {
  401: 'Sign in to share',
  403: "This post isn't yours to share",
  404: 'Post not ready — wait for verification',
  429: 'Too many attempts — try in a minute',
  500: 'Card generation failed — tap to retry',
}

function getErrorMessage(status: number): string {
  return ERROR_MESSAGES[status] ?? `Generation failed (${status}) — tap to retry`
}

// Safe to call in render — guards typeof navigator for SSR.
// This component only appears after workout verification so hydration is
// complete by the time the user ever sees the button.
function checkCanShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !('share' in navigator)) return false
  try {
    return navigator.canShare({
      files: [new File([''], 'test.png', { type: 'image/png' })],
    })
  } catch {
    return false
  }
}

export function StoryShareButton({
  postId,
  streakCount,
  workoutType,
  isPersonalBest,
}: StoryShareButtonProps) {
  const [shareState, setShareState] = useState<ShareState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('Card generation failed — tap to retry')

  // Derived each render — no effect needed, no hydration mismatch risk at
  // this point in the flow (component mounts after a multi-second AI round-trip)
  const canShare = checkCanShareFiles()

  const handleShare = useCallback(async () => {
    setShareState('generating')
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(postId)}`)
      if (!res.ok) {
        setErrorMsg(getErrorMessage(res.status))
        setShareState('error')
        setTimeout(() => setShareState('idle'), 5000)
        return
      }
      const blob = await res.blob()

      const filename = `beactive-${workoutType?.toLowerCase() ?? 'workout'}-day${streakCount ?? 0}.png`
      const file = new File([blob], filename, { type: 'image/png' })

      // Re-check at call time — handles edge case where capability changed
      if (checkCanShareFiles()) {
        await navigator.share({ files: [file] })
        setShareState('success')
        setTimeout(() => setShareState('idle'), 3000)
      } else {
        // Desktop / unsupported browser — download the PNG
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
        setShareState('downloaded')
        setTimeout(() => setShareState('idle'), 5000)
      }
    } catch (err) {
      // AbortError = user dismissed the OS share sheet — not a failure
      if (err instanceof Error && err.name === 'AbortError') {
        setShareState('idle')
        return
      }
      setErrorMsg('Something went wrong — card may have downloaded')
      setShareState('error')
      setTimeout(() => setShareState('idle'), 5000)
    }
  }, [postId, streakCount, workoutType])

  const label = (() => {
    if (shareState === 'generating') return 'Creating your story…'
    if (shareState === 'success') return 'Story shared!'
    if (shareState === 'downloaded') return 'Card saved — post it to your story'
    if (shareState === 'error') return errorMsg
    const action = canShare ? 'Share' : 'Download'
    const qualifier = isPersonalBest ? ' new best' : ''
    const day = streakCount ? ` · Day ${streakCount}` : ''
    return `${action}${qualifier} story card${day}`
  })()

  const isGenerating = shareState === 'generating'
  const isError = shareState === 'error'
  const isSuccess = shareState === 'success' || shareState === 'downloaded'

  return (
    <button
      onClick={handleShare}
      disabled={isGenerating}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background: isError
          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
          : isSuccess
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: 'white',
        boxShadow: isError
          ? '0 4px 16px rgba(239,68,68,0.35)'
          : '0 4px 16px rgba(34,197,94,0.40)',
      }}
      aria-label={label}
    >
      {isGenerating ? (
        <SpinnerIcon />
      ) : isError ? (
        <ErrorIcon />
      ) : isSuccess ? (
        <CheckIcon />
      ) : canShare ? (
        <ShareIcon />
      ) : (
        <DownloadIcon />
      )}
      <span>{label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// SVG icons — 1.5px stroke, 24×24 viewport
// ---------------------------------------------------------------------------
function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 6 12 2 8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
