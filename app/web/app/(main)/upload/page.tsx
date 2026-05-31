'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { usePostStatus } from '@/hooks/usePostStatus'

// ---------------------------------------------------------------------------
// EXIF stripping via canvas — drawing to canvas discards all metadata
// ---------------------------------------------------------------------------
async function stripExif(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob returned null'))
        },
        file.type,
        0.92
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
type Stage = 'select' | 'preview' | 'uploading' | 'verifying' | 'recorded' | 'not_a_workout' | 'still_checking'

interface SelectedFile {
  originalFile: File
  previewUrl: string
}

export default function UploadPage() {
  const router = useRouter()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('select')
  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [caption, setCaption] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [postId, setPostId] = useState<string | null>(null)
  const [workoutType, setWorkoutType] = useState<string | undefined>(undefined) // set by polling effect in Task 4

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
  }, [selected])

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
  }, [selected, caption])

  const resetToSelect = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    setSelected(null)
    setCaption('')
    setError(null)
    setUploadProgress(0)
    setPostId(null)
    setWorkoutType(undefined)
    setStage('select')
  }, [selected])

  const handleContinue = useCallback(() => {
    if (selected) URL.revokeObjectURL(selected.previewUrl)
    router.push('/feed')
  }, [selected, router])

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (selected) URL.revokeObjectURL(selected.previewUrl)
    }
  }, [selected])

  const { data: postStatus } = usePostStatus(postId, stage === 'verifying')

  // Drive stage transitions from poll result
  useEffect(() => {
    if (stage !== 'verifying' || !postStatus) return
    if (postStatus.status === 'VERIFIED') {
      setWorkoutType(postStatus.workoutType)
      setStage('recorded')
    } else if (postStatus.status === 'REJECTED') {
      setStage('not_a_workout')
    }
  }, [postStatus, stage])

  // 30-second timeout → still_checking
  useEffect(() => {
    if (stage !== 'verifying') return
    const t = setTimeout(() => setStage('still_checking'), 30_000)
    return () => clearTimeout(t)
  }, [stage])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (stage === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>Uploading…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-black rounded-full h-2 transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Your photo is being securely uploaded
        </p>
      </div>
    )
  }

  if (stage === 'verifying' && selected) {
    return (
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="relative overflow-hidden rounded-2xl bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="Workout photo"
            className="w-full aspect-square object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-scan" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold">Checking your workout</p>
          <p className="text-sm text-gray-400">This usually takes a few seconds</p>
        </div>
      </div>
    )
  }

  if (stage === 'preview' && selected) {
    return (
      <div className="space-y-6 max-w-sm mx-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={resetToSelect}
            className="text-sm text-gray-500 hover:text-black transition-colors"
          >
            ← Change photo
          </button>
          <h1 className="text-lg font-semibold">Preview</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.previewUrl}
            alt="Workout preview"
            className="w-full aspect-square object-cover rounded-2xl bg-gray-100"
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

  // Terminal stages — placeholder until Task 6 adds full result UIs
  if (stage === 'recorded' || stage === 'not_a_workout' || stage === 'still_checking') {
    return null
  }

  // stage === 'select'
  return (
    <div className="space-y-8 max-w-sm mx-auto">
      <div>
        <h1 className="text-xl font-semibold">Log today&apos;s workout</h1>
        <p className="text-sm text-gray-500 mt-1">
          Take a photo or choose one from your gallery.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Camera capture — primary action on mobile */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 h-48 rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <span className="text-4xl">📷</span>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-800">Open camera</p>
            <p className="text-xs text-gray-400 mt-0.5">Take a photo of your workout</p>
          </div>
        </button>

        {/* Gallery upload — secondary / desktop fallback */}
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 h-32 rounded-2xl border border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <span className="text-2xl">🖼</span>
          <p className="text-sm text-gray-600">Choose from gallery</p>
        </button>
      </div>

      <p className="text-xs text-center text-gray-400">
        Accepted: JPEG, PNG, WebP · Max 10 MB
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
