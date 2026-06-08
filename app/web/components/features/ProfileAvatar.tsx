'use client'
import { useRef, useState, type ChangeEvent } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { AvatarViewer } from './AvatarViewer'
import { AvatarEditor } from './AvatarEditor'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  )
}

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

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setEditingFile(file)
    e.target.value = ''
  }

  const onAvatarClick = avatarUrl
    ? () => setViewerOpen(true)
    : isSelf
      ? () => fileRef.current?.click()
      : undefined

  return (
    <div className="relative flex-shrink-0">
      {/* Avatar — 82px with brand ring on own profile */}
      <div
        className={`rounded-full ${isSelf ? 'ring-[2.5px] ring-brand-500 ring-offset-2' : ''}`}
        style={isSelf ? { boxShadow: '0 0 0 2px white, 0 0 0 4.5px #22c55e' } : undefined}
      >
        <Avatar src={avatarUrl} name={name} size="2xl" onClick={onAvatarClick} />
      </div>

      {/* Camera badge — own profile only, bottom-right */}
      {isSelf && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={set.isPending}
          aria-label={avatarUrl ? 'Change profile photo' : 'Add profile photo'}
          className="absolute bottom-0 right-0 flex items-center justify-center w-7 h-7 rounded-full bg-brand-500 text-white border-2 border-white hover:bg-brand-600 transition-colors disabled:opacity-60"
          style={{ boxShadow: '0 2px 6px rgba(34,197,94,0.4)' }}
        >
          {set.isPending ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <CameraIcon />
          )}
        </button>
      )}

      {/* Remove link — appears below as subtle text only when there's an avatar */}
      {isSelf && avatarUrl && !set.isPending && (
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-400 hover:text-red-500 transition-colors whitespace-nowrap disabled:opacity-50"
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
        aria-hidden
      />

      {error && (
        <p className="text-[10px] text-red-500 text-center max-w-[6rem] mt-1 leading-tight">
          {error.message}
        </p>
      )}

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
