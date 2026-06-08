'use client'
import { useState, useCallback } from 'react'

interface StoryShareButtonProps {
  postId: string
  streakCount: number | null
  workoutType: string | undefined
  isPersonalBest: boolean
}

type ShareState = 'idle' | 'generating' | 'error'

const ERROR_MESSAGES: Record<number, string> = {
  401: 'Sign in to share',
  403: 'This post isn\'t yours to share',
  404: 'Post not ready — wait for verification',
  429: 'Too many attempts — try in a minute',
  500: 'Card generation failed — tap to retry',
}

function getErrorMessage(status: number): string {
  return ERROR_MESSAGES[status] ?? `Generation failed (${status}) — tap to retry`
}

function canShareFiles(): boolean {
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

  const handleShare = useCallback(async () => {
    setShareState('generating')
    try {
      const res = await fetch(`/api/stories/generate?postId=${encodeURIComponent(postId)}`)
      if (!res.ok) {
        setErrorMsg(getErrorMessage(res.status))
        setShareState('error')
        setTimeout(() => setShareState('idle'), 4000)
        return
      }
      const blob = await res.blob()

      const filename = `beactive-${workoutType?.toLowerCase() ?? 'workout'}-day${streakCount ?? 0}.png`
      const file = new File([blob], filename, { type: 'image/png' })

      if (canShareFiles()) {
        await navigator.share({ files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
        URL.revokeObjectURL(url)
      }

      setShareState('idle')
    } catch (err) {
      // AbortError = user dismissed the share sheet — not a real error
      if (err instanceof Error && err.name === 'AbortError') {
        setShareState('idle')
        return
      }
      setErrorMsg('Sharing unavailable — card downloaded instead')
      setShareState('error')
      setTimeout(() => setShareState('idle'), 4000)
    }
  }, [postId, streakCount, workoutType])

  const isGenerating = shareState === 'generating'
  const isError = shareState === 'error'

  return (
    <button
      onClick={handleShare}
      disabled={isGenerating}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background: isError
          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
          : 'linear-gradient(135deg, #22c55e, #16a34a)',
        color: 'white',
        boxShadow: isError
          ? '0 4px 16px rgba(239,68,68,0.35)'
          : '0 4px 16px rgba(34,197,94,0.40)',
      }}
      aria-label={isGenerating ? 'Generating story card…' : 'Share workout story'}
    >
      {isGenerating ? (
        <>
          <SpinnerIcon />
          <span>Creating your story…</span>
        </>
      ) : isError ? (
        <>
          <ErrorIcon />
          <span>{errorMsg}</span>
        </>
      ) : (
        <>
          <ShareCardIcon />
          <span>
            Share{isPersonalBest ? ' new best ' : ' '}story
            {streakCount ? ` · Day ${streakCount}` : ''}
          </span>
        </>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Inline SVG icons — 1.5px stroke, 20×20 viewport
// ---------------------------------------------------------------------------
function ShareCardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 3v3M9 3v3M3 9h3M18 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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
