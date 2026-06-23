'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface StoryShareButtonProps {
  postId: string
  streakCount: number | null
  workoutType: string | undefined
  isPersonalBest: boolean
}

// ---------------------------------------------------------------------------
// Why this component prepares the card BEFORE the tap:
//
// navigator.share({ files }) requires *transient user activation* — it must run
// within ~5s of the user's tap. The card render is slow (prod p50 ~19s, p90 ~44s:
// cold sharp + Satori). The old design did `await fetch(...)` INSIDE the click
// handler, then called share() — by the time the render finished, activation had
// expired and share() threw NotAllowedError, surfaced as a generic error. The
// next tap hit the now-cached asset (fast) and shared within the window, which is
// exactly the "fails first, succeeds second" symptom.
//
// Fix: kick off the render/fetch on MOUNT (off the gesture path). The held fetch
// also keeps the serverless render alive to completion + R2 persistence (the
// fire-and-forget server pre-gen frequently gets reaped). The Share button only
// becomes actionable once the File is in hand; the tap then calls share()
// SYNCHRONOUSLY with the ready file, so activation is always fresh.
// ---------------------------------------------------------------------------

type ShareState = 'preparing' | 'ready' | 'sharing' | 'shared' | 'downloaded' | 'error'

const ERROR_MESSAGES: Record<number, string> = {
  401: 'Sign in to share',
  403: "This post isn't yours to share",
  404: 'Post not ready — wait for verification',
  429: 'Too many attempts — try in a minute',
  500: 'Card render failed — tap to retry',
}

function getErrorMessage(status: number): string {
  return ERROR_MESSAGES[status] ?? `Render failed (${status}) — tap to retry`
}

// Fire-and-forget analytics beacon — never blocks or affects share/download UX.
function reportShare(postId: string, method: 'web_share' | 'download') {
  void fetch(`/api/stories/${encodeURIComponent(postId)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method }),
  }).catch(() => {})
}

// Safe to call in render — guards typeof navigator for SSR.
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
  const [shareState, setShareState] = useState<ShareState>('preparing')
  const [errorMsg, setErrorMsg] = useState<string>('Card render failed — tap to retry')

  // The prepared PNG, ready for a synchronous share() at tap time.
  const fileRef = useRef<File | null>(null)
  // Guards against React Strict Mode double-invoking the mount effect in dev,
  // and against setState after unmount.
  const startedRef = useRef(false)
  const mountedRef = useRef(true)

  const canShare = checkCanShareFiles()

  const filename = `beactive-${workoutType?.toLowerCase() ?? 'workout'}-day${streakCount ?? 0}.png`

  // Render + fetch the card off the gesture path. Bounded retry handles genuine
  // cold-render 5xx crashes (evidence: stories stuck mid-render). 4xx is terminal.
  const prepareCard = useCallback(async () => {
    if (mountedRef.current) setShareState('preparing')
    fileRef.current = null

    let res: Response | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(`/api/stories/${encodeURIComponent(postId)}`)
      } catch {
        res = null
      }
      if (res && res.ok) break
      if (res && res.status < 500) break // 4xx — terminal, don't retry
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
    }

    if (!res || !res.ok) {
      if (!mountedRef.current) return
      setErrorMsg(getErrorMessage(res?.status ?? 500))
      setShareState('error')
      return
    }

    const blob = await res.blob()
    if (!mountedRef.current) return
    fileRef.current = new File([blob], filename, { type: 'image/png' })
    setShareState('ready')
  }, [postId, filename])

  useEffect(() => {
    mountedRef.current = true
    if (!startedRef.current) {
      startedRef.current = true
      void prepareCard()
    }
    return () => {
      mountedRef.current = false
    }
  }, [prepareCard])

  // Synchronous download — anchor click within the gesture (no await beforehand).
  const downloadFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      reportShare(postId, 'download')
      setShareState('downloaded')
      setTimeout(() => {
        if (mountedRef.current) setShareState('ready')
      }, 5000)
    },
    [filename, postId]
  )

  // IMPORTANT: not async. share() must be called synchronously inside the click
  // so transient activation is still valid. The file is already in hand.
  const handleClick = useCallback(() => {
    if (shareState === 'error') {
      void prepareCard()
      return
    }
    const file = fileRef.current
    if (!file) return // still preparing — button is disabled, defensive guard

    if (checkCanShareFiles()) {
      setShareState('sharing')
      navigator
        .share({ files: [file] })
        .then(() => {
          reportShare(postId, 'web_share')
          if (!mountedRef.current) return
          setShareState('shared')
          setTimeout(() => {
            if (mountedRef.current) setShareState('ready')
          }, 3000)
        })
        .catch((err: unknown) => {
          if (!mountedRef.current) return
          // User dismissed the OS share sheet — not a failure.
          if (err instanceof Error && err.name === 'AbortError') {
            setShareState('ready')
            return
          }
          // NotAllowedError (activation edge case) or any other share failure —
          // fall back to a direct download rather than a dead end.
          downloadFile(file)
        })
    } else {
      downloadFile(file)
    }
  }, [postId, shareState, prepareCard, downloadFile])

  const label = (() => {
    if (shareState === 'preparing') return 'Preparing your story card…'
    if (shareState === 'sharing') return 'Opening share…'
    if (shareState === 'shared') return 'Story shared!'
    if (shareState === 'downloaded') return 'Card saved — post it to your story'
    if (shareState === 'error') return errorMsg
    const action = canShare ? 'Share' : 'Download'
    const qualifier = isPersonalBest ? ' new best' : ''
    const day = streakCount ? ` · Day ${streakCount}` : ''
    return `${action}${qualifier} story card${day}`
  })()

  const isBusy = shareState === 'preparing' || shareState === 'sharing'
  const isError = shareState === 'error'
  const isSuccess = shareState === 'shared' || shareState === 'downloaded'

  return (
    <button
      onClick={handleClick}
      disabled={isBusy}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
      style={{
        background: isError
          ? 'linear-gradient(135deg, #ef4444, #dc2626)'
          : isSuccess
            ? 'linear-gradient(135deg, #406331, #335028)'
            : 'linear-gradient(135deg, #4f7a3c, #406331)',
        color: 'white',
        boxShadow: isError
          ? '0 4px 16px rgba(239,68,68,0.35)'
          : '0 4px 16px rgba(34,197,94,0.40)',
      }}
      aria-label={label}
    >
      {isBusy ? (
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
