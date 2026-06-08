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
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const { set, remove } = useUpdateAvatar()
  const error = (set.error ?? remove.error) as Error | undefined

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setEditingFile(file)
    e.target.value = ''
  }

  function handleCameraBadgeClick() {
    // If they have an avatar: show Change/Remove menu
    // If no avatar yet: go straight to file picker
    if (avatarUrl) {
      setMenuOpen(v => !v)
    } else {
      fileRef.current?.click()
    }
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

      {/* Camera badge — own profile only, bottom-right.
          When avatar exists: opens Change/Remove popover.
          When no avatar: opens file picker directly. */}
      {isSelf && (
        <div className="absolute bottom-0 right-0">
          <button
            onClick={handleCameraBadgeClick}
            disabled={set.isPending || remove.isPending}
            aria-label={avatarUrl ? 'Change or remove profile photo' : 'Add profile photo'}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-500 text-white border-2 border-white hover:bg-brand-600 transition-colors disabled:opacity-60"
            style={{ boxShadow: '0 2px 6px rgba(34,197,94,0.4)' }}
          >
            {(set.isPending || remove.isPending) ? (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <CameraIcon />
            )}
          </button>

          {/* Change / Remove mini popover — appears when avatar exists and badge is clicked */}
          {menuOpen && avatarUrl && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="absolute bottom-full right-0 mb-2 z-20 w-36 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 py-1.5 overflow-hidden animate-spring-in"
                role="menu"
              >
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); fileRef.current?.click() }}
                  className="w-full text-left px-4 py-2 text-[13px] font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Change photo
                </button>
                <div className="border-t border-gray-100 mx-2" />
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); remove.mutate() }}
                  disabled={remove.isPending}
                  className="w-full text-left px-4 py-2 text-[13px] font-medium text-red-500 hover:bg-red-50/70 transition-colors disabled:opacity-50"
                >
                  Remove photo
                </button>
              </div>
            </>
          )}
        </div>
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
        <p className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 text-[10px] text-red-500 text-center w-28 leading-tight whitespace-normal">
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
