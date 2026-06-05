'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Button } from '@/components/ui/Button'
import { getCroppedBlob } from '@/lib/image/cropImage'

// Instagram-style avatar editor: circular crop with drag-to-reposition, zoom
// (slider + wheel + pinch via react-easy-crop), and rotate. The selected file is
// only processed into the avatar on Save — never used as-is. Outputs a square
// 512px JPEG uploaded through the existing avatar pipeline.
export function AvatarEditor({
  file,
  onSave,
  onCancel,
  saving,
}: {
  file: File
  onSave: (blob: Blob) => void
  onCancel: () => void
  saving: boolean
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [areaPixels, setAreaPixels] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  // Derive the object URL during render (pure enough for object URLs); revoke on
  // change/unmount. Avoids setState-in-effect.
  const imageSrc = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(imageSrc), [imageSrc])

  // Modal a11y: focus the dialog, Esc to cancel, lock background scroll.
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel, saving])

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => setAreaPixels(areaPx), [])

  async function handleSave() {
    if (!areaPixels) return
    setError(null)
    try {
      const blob = await getCroppedBlob(imageSrc, areaPixels, rotation)
      onSave(blob)
    } catch {
      setError('Could not process the image. Please try another.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile picture"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold">Edit photo</h2>
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={saving}
            aria-label="Cancel"
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Crop surface — circular preview, drag + pinch + wheel zoom */}
        <div className="relative h-72 w-full bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-12">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-black"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-12">Rotate</span>
            <button
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              aria-label="Rotate left"
              className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
            >
              ⟲
            </button>
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotate right"
              className="rounded-full bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200"
            >
              ⟳
            </button>
            <span className="ml-auto text-[11px] text-gray-400">Drag to reposition</span>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={saving}
              className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <Button onClick={handleSave} isLoading={saving} disabled={!areaPixels}>
              Save photo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
