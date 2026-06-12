'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { StoryShareButton } from '@/components/features/StoryShareButton'
import { usePostStatus } from '@/hooks/usePostStatus'
import { useStreak } from '@/hooks/useStreak'

// ---------------------------------------------------------------------------
// EXIF stripping via canvas — drawing to canvas discards all metadata.
// Also caps the longest edge at MAX_DIMENSION: phone cameras commonly produce
// 3000-4000px images, which the feed/profile then fetch at full size with no
// server-side resize. 1600px keeps plenty of detail while cutting pixel count
// (and R2 payload size) by 5-10x for typical uploads.
// ---------------------------------------------------------------------------
const MAX_DIMENSION = 1600

async function stripExif(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob returned null'))
        },
        file.type,
        0.85
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image for EXIF stripping'))
    }

    img.src = objectUrl
  })
}

// ---------------------------------------------------------------------------
// XHR upload — fetch() doesn't expose upload progress events
// ---------------------------------------------------------------------------
async function uploadToR2(
  presignedUrl: string,
  blob: Blob,
  mimeType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 upload failed — HTTP ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('R2 upload failed: network error')))
    xhr.addEventListener('abort', () => reject(new Error('R2 upload aborted')))
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.send(blob)
  })
}

// ---------------------------------------------------------------------------
// Page states
// ---------------------------------------------------------------------------
type Stage = 'select' | 'preview' | 'uploading' | 'verifying' | 'recorded' | 'not_a_workout' | 'still_checking' | 'already_done'

interface StageState {
  stage: Stage
  workoutType?: string
}

interface SelectedFile {
  originalFile: File
  previewUrl: string
}

// ---------------------------------------------------------------------------
// Line-art icons — crafted in-house to keep the surface calm and brand-neutral
// (no emoji, no third-party icon set). 1.5px strokes, rounded joins.
// ---------------------------------------------------------------------------
function CameraIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 9.5A2.5 2.5 0 0 1 5.5 7h1.2a1 1 0 0 0 .83-.45l.74-1.1A1 1 0 0 1 9.1 5h5.8a1 1 0 0 1 .83.45l.74 1.1a1 1 0 0 0 .83.45h1.2A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function GalleryIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 16.5l4-3.5a2 2 0 0 1 2.6 0l3.4 3M14 14l1.6-1.4a2 2 0 0 1 2.6 0l2 1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [{ stage, workoutType }, setStageState] = useState<StageState>({ stage: 'select' })
  const setStage = useCallback((s: Stage) => setStageState((prev) => ({ ...prev, stage: s })), [])
  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [caption, setCaption] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [postId, setPostId] = useState<string | null>(null)

  const handleFileChosen = useCallback(async (file: File) => {
    setError(null)

    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed.')
      return
    }
    const MAX = 10 * 1024 * 1024
    if (file.size > MAX) {
      setError('Image must be smaller than 10 MB.')
      return
    }

    // Revoke previous preview URL to avoid memory leak
    if (selected) URL.revokeObjectURL(selected.previewUrl)

    // Show a temporary preview while we strip EXIF
    const rawPreviewUrl = URL.createObjectURL(file)
    setSelected({ originalFile: file, previewUrl: rawPreviewUrl })
    setStage('preview')
  }, [selected, setStage])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileChosen(file)
      // Reset so the same file can be re-selected
      e.target.value = ''
    },
    [handleFileChosen]
  )

  const handlePost = useCallback(async () => {
    if (!selected) return
    setError(null)
    setStage('uploading')
    setUploadProgress(0)
    setIsRetrying(false)

    try {
      // 1. Strip EXIF client-side (canvas render resets all metadata)
      const cleanBlob = await stripExif(selected.originalFile)
      const mimeType = selected.originalFile.type

      // 2. Get presigned upload URL
      const signRes = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType, fileSize: cleanBlob.size }),
      })
      if (!signRes.ok) {
        const data = await signRes.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? 'Failed to start upload')
      }
      const { uploadUrl, key } = await signRes.json()

      // 3. Upload clean blob directly to R2 with progress tracking
      await uploadToR2(uploadUrl, cleanBlob, mimeType, setUploadProgress)

      // 4. Create post record in DB
      const createRes = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageKey: key, caption: caption.trim() || undefined }),
      })
      if (!createRes.ok) {
        if (createRes.status === 409) { setStage('already_done'); return }
        const data = await createRes.json().catch(() => ({}))
        throw new Error(data?.error?.message ?? 'Failed to create post')
      }

      // 5. Capture post ID and enter verification stage
      const { post } = (await createRes.json()) as { post: { id: string } }
      setPostId(post.id)
      setStage('verifying')
      // Preview URL intentionally kept alive — needed for verifying UI
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStage('preview')
      setIsRetrying(true)
    }
  }, [selected, caption, setStage])

  const resetToSelect = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected(null)
    setCaption('')
    setError(null)
    setUploadProgress(0)
    setPostId(null)
    setStageState({ stage: 'select', workoutType: undefined })
  }, [selected])

  const handleContinue = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    // Guarantee the feed mounts with a fresh streak. By the time the user taps
    // Continue, the server-side streak write has committed, so this refetch
    // reflects the increment — covers the recorded, still_checking, and
    // already_done paths without ever needing a manual refresh.
    queryClient.invalidateQueries({ queryKey: ['streak', 'me'] })
    router.push('/feed')
  }, [selected, router, queryClient])

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (selected) URL.revokeObjectURL(selected.previewUrl)
    }
  }, [selected])

  const { data: postStatus } = usePostStatus(postId, stage === 'verifying')
  const { data: streakData } = useStreak()

  // Drive stage transitions from poll result.
  // This effect subscribes to an external polling system (TanStack Query) and updates
  // local stage state when the server reports a terminal classification result.
  useEffect(() => {
    if (stage !== 'verifying' || !postStatus) return
    if (postStatus.status === 'VERIFIED') {
      queryClient.invalidateQueries({ queryKey: ['streak', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStageState({ stage: 'recorded', workoutType: postStatus.workoutType })
    } else if (postStatus.status === 'REJECTED') {
      setStageState({ stage: 'not_a_workout' })
    }
  }, [postStatus, stage, queryClient])

  // 30-second timeout → still_checking
  useEffect(() => {
    if (stage !== 'verifying') return
    const t = setTimeout(() => setStage('still_checking'), 30_000)
    return () => clearTimeout(t)
  }, [stage, setStage])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (stage === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-8 animate-rise">
        <div className="w-full max-w-xs">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-sm font-medium text-gray-900">Uploading</span>
            <span className="text-sm tabular-nums text-gray-400">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gray-900 rounded-full h-1.5 transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 tracking-wide">
          Securing your photo
        </p>
      </div>
    )
  }

  if (stage === 'verifying' && selected) {
    return (
      <div className="space-y-7 max-w-sm mx-auto animate-rise">
        <div className="relative overflow-hidden rounded-3xl bg-gray-100 shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="Workout photo"
            className="w-full aspect-square object-cover"
          />
          {/* Soft dim so the moving highlight reads clearly */}
          <div className="absolute inset-0 bg-black/5" />
          <div className="absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-scan" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold tracking-tight">Checking your workout</p>
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-breathe" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-breathe" style={{ animationDelay: '200ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300 animate-breathe" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'preview' && selected) {
    return (
      <div className="space-y-6 max-w-sm mx-auto animate-rise">
        <div className="flex items-center justify-between">
          <button
            onClick={resetToSelect}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <span aria-hidden>←</span> Change
          </button>
          <h1 className="text-sm font-medium text-gray-400">Ready to post</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="Workout preview"
            className="w-full aspect-square object-cover rounded-3xl bg-gray-100 shadow-sm ring-1 ring-black/5"
          />
        </div>

        <div>
          <label
            htmlFor="caption"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Caption <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={500}
            placeholder="What did you crush today?"
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400 transition"
          />
          <p className="text-xs text-gray-400 text-right mt-1">
            {caption.length}/500
          </p>
        </div>

        <Button
          onClick={handlePost}
          className="w-full"
        >
          {isRetrying ? 'Retry upload' : 'Post workout'}
        </Button>
      </div>
    )
  }

  if (stage === 'recorded') {
    const streakCount = streakData?.current ?? null
    const isPersonalBest = streakData
      ? streakData.current === streakData.best && streakData.current > 1
      : false

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 max-w-sm mx-auto">
        {/* Animated checkmark with green glow */}
        <div className="relative animate-pop">
          <div className="absolute inset-0 rounded-full bg-brand-300/30 scale-[1.8] blur-2xl" />
          <div className="relative w-28 h-28 rounded-full bg-brand-50 ring-2 ring-brand-200 flex items-center justify-center">
            <svg className="w-14 h-14 text-brand-500" viewBox="0 0 24 24" fill="none" aria-label="Workout verified">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="100"
                strokeDashoffset="100"
                className="animate-draw-check"
                style={{ animationDelay: '150ms' }}
              />
            </svg>
          </div>
        </div>

        {/* Streak count — the hero number */}
        {streakCount !== null && (
          <div className="text-center animate-rise" style={{ animationDelay: '200ms' }}>
            <p className="text-[64px] font-bold tabular-nums leading-none text-gray-900">{streakCount}</p>
            <p className="text-lg font-medium text-gray-500 mt-1">day streak 🔥</p>
            {isPersonalBest && (
              <span className="mt-3 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1.5 rounded-full animate-pop" style={{ animationDelay: '400ms' }}>
                🏆 New personal best!
              </span>
            )}
          </div>
        )}

        {/* Status + workout type */}
        <div className="text-center space-y-2 animate-rise" style={{ animationDelay: '260ms' }}>
          <p className="text-xl font-semibold tracking-tight text-gray-900">Locked in for today.</p>
          {workoutType && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-sm font-medium text-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {workoutType.charAt(0) + workoutType.slice(1).toLowerCase()}
            </span>
          )}
        </div>

        {/* CTAs */}
        <div className="w-full space-y-3 animate-rise" style={{ animationDelay: '320ms' }}>
          {postId && (
            <StoryShareButton
              postId={postId}
              streakCount={streakCount}
              workoutType={workoutType}
              isPersonalBest={isPersonalBest}
            />
          )}
          <Button onClick={handleContinue} variant="secondary" className="w-full rounded-full">
            Back to feed
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'not_a_workout') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-7 max-w-sm mx-auto">
        <div className="w-24 h-24 rounded-full bg-gray-50 ring-1 ring-gray-200/70 flex items-center justify-center animate-pop">
          <svg
            className="w-10 h-10 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Not a workout"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M15 9l-6 6M9 9l6 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="text-center space-y-3 animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-2xl font-semibold tracking-tight">This doesn&apos;t look like a workout</p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
            Make sure your photo clearly shows you being active, then give it another go.
          </p>
        </div>
        <div className="w-full max-w-xs animate-rise" style={{ animationDelay: '220ms' }}>
          <Button onClick={resetToSelect} className="w-full">
            Try a different photo
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'already_done') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-7 max-w-sm mx-auto">
        <div className="relative animate-pop">
          <div className="absolute inset-0 rounded-full bg-emerald-100/60 scale-150 blur-xl" />
          <div className="relative w-24 h-24 rounded-full bg-emerald-50 ring-1 ring-emerald-200/70 flex items-center justify-center">
            <svg
              className="w-11 h-11 text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Already completed today"
            >
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="text-center space-y-3 animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-2xl font-semibold tracking-tight">You&apos;re all set for today</p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
            Today&apos;s workout is already locked in. Come back tomorrow to keep your streak alive.
          </p>
        </div>
        <div className="w-full max-w-xs animate-rise" style={{ animationDelay: '220ms' }}>
          <Button onClick={handleContinue} className="w-full">
            Back to feed
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'still_checking') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-7 max-w-sm mx-auto">
        <div className="w-24 h-24 rounded-full bg-amber-50 ring-1 ring-amber-200/70 flex items-center justify-center animate-pop">
          <svg
            className="w-10 h-10 text-amber-500"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Still checking"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M12 7.5v5l3 2"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-center space-y-3 animate-rise" style={{ animationDelay: '120ms' }}>
          <p className="text-2xl font-semibold tracking-tight">This is taking a moment</p>
          <p className="text-sm text-gray-400 max-w-xs mx-auto leading-relaxed">
            Your workout is still being checked. We&apos;ll update your feed the moment it&apos;s ready.
          </p>
        </div>
        <div className="w-full max-w-xs animate-rise" style={{ animationDelay: '220ms' }}>
          <Button onClick={handleContinue} className="w-full">
            Continue to feed
          </Button>
        </div>
      </div>
    )
  }

  // stage === 'select'
  return (
    <div className="space-y-8 max-w-sm mx-auto animate-rise">
      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Today</p>
        <h1 className="text-2xl font-semibold tracking-tight">Log your workout</h1>
        <p className="text-sm text-gray-500">
          One photo. That&apos;s all it takes to keep your streak alive.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {/* Camera capture — primary action on mobile */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="group flex items-center gap-4 px-5 h-24 rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm hover:ring-gray-900/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition-transform duration-200 group-hover:scale-105">
            <CameraIcon className="h-6 w-6" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-gray-900">Take a photo</span>
            <span className="block text-xs text-gray-400 mt-0.5">Capture your workout right now</span>
          </span>
          <span className="text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-500" aria-hidden>→</span>
        </button>

        {/* Gallery upload — secondary / desktop fallback */}
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="group flex items-center gap-4 px-5 h-20 rounded-2xl bg-white ring-1 ring-gray-200 hover:ring-gray-900/20 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-colors duration-200 group-hover:bg-gray-200">
            <GalleryIcon className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-gray-800">Choose from gallery</span>
          </span>
          <span className="text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-500" aria-hidden>→</span>
        </button>
      </div>

      <p className="text-xs text-center text-gray-400">
        JPEG, PNG, or WebP · up to 10 MB
      </p>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
        aria-label="Capture workout photo with camera"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleInputChange}
        aria-label="Select workout photo from gallery"
      />
    </div>
  )
}
