'use client'
import { useRef, useState, type ChangeEvent } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { AvatarViewer } from './AvatarViewer'
import { AvatarEditor } from './AvatarEditor'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'

// Profile-header avatar: tap to open the full-screen viewer; for the owner, also
// exposes change / remove (upload reuses the R2 infra via useUpdateAvatar).
export function ProfileAvatar({
  name,
  avatarUrl,
  isSelf,
}: {
  name: string
  avatarUrl: string | null
  isSelf: boolean
}) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [editingFile, setEditingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { set, remove } = useUpdateAvatar()
  const error = (set.error ?? remove.error) as Error | undefined

  // Selecting a file opens the editor — the raw image never becomes the avatar
  // until the user crops/zooms/rotates and saves.
  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setEditingFile(file)
    e.target.value = '' // allow re-selecting the same file
  }

  // Tapping the avatar: open the viewer if there's a picture; for the owner with
  // no picture, open the file picker instead.
  const onAvatarClick = avatarUrl
    ? () => setViewerOpen(true)
    : isSelf
      ? () => fileRef.current?.click()
      : undefined

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Avatar src={avatarUrl} name={name} size="xl" onClick={onAvatarClick} />

      {isSelf && (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={set.isPending}
            className="font-medium text-black hover:opacity-70 disabled:opacity-50"
          >
            {set.isPending ? 'Uploading…' : avatarUrl ? 'Change' : 'Add photo'}
          </button>
          {avatarUrl && (
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="text-gray-400 hover:text-red-500 disabled:opacity-50"
            >
              {remove.isPending ? '…' : 'Remove'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="hidden"
          />
        </div>
      )}

      {error && <p className="text-xs text-red-500 text-center max-w-[8rem]">{error.message}</p>}

      {viewerOpen && avatarUrl && (
        <AvatarViewer src={avatarUrl} name={name} onClose={() => setViewerOpen(false)} />
      )}

      {editingFile && (
        <AvatarEditor
          file={editingFile}
          saving={set.isPending}
          onCancel={() => setEditingFile(null)}
          onSave={(blob) => set.mutate(blob, { onSuccess: () => setEditingFile(null) })}
        />
      )}
    </div>
  )
}

