'use client'
import { useRef, useState, useEffect, type ChangeEvent } from 'react'
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface MenuCoords {
  bottom: number  // distance from viewport bottom to menu bottom edge
  left: number    // distance from viewport left to menu left edge
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
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const cameraBtnRef = useRef<HTMLButtonElement>(null)
  const { set, remove } = useUpdateAvatar()
  const error = (set.error ?? remove.error) as Error | undefined

  // Close menu on scroll — prevents the fixed menu drifting while page scrolls
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', close, { capture: true })
  }, [menuOpen])

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setEditingFile(file)
    e.target.value = ''
  }

  function handleCameraBadgeClick() {
    if (!avatarUrl) {
      // No avatar: go straight to file picker
      fileRef.current?.click()
      return
    }

    if (menuOpen) {
      setMenuOpen(false)
      return
    }

    // ── Root-cause fix ────────────────────────────────────────────────────────
    // The profile card has overflow:hidden. Absolute-positioned descendants are
    // clipped by it. Using position:fixed bypasses ALL ancestor overflow constraints
    // because fixed elements are positioned relative to the viewport, not the DOM tree.
    //
    // We calculate the anchor coords from the camera button's viewport rect,
    // then render the menu with fixed positioning.
    // ─────────────────────────────────────────────────────────────────────────
    const rect = cameraBtnRef.current?.getBoundingClientRect()
    if (!rect) return

    const MENU_WIDTH = 152  // w-38 = 152px
    const GAP = 8           // gap between button top and menu bottom

    // Align menu's left edge with the button's left edge.
    // Clamp so menu never bleeds past the right or left viewport edge.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))

    // Open upward: menu bottom edge = button top edge - gap
    const bottom = window.innerHeight - rect.top + GAP

    setMenuCoords({ bottom, left })
    setMenuOpen(true)
  }

  const onAvatarClick = avatarUrl
    ? () => setViewerOpen(true)
    : isSelf
      ? () => fileRef.current?.click()
      : undefined

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="relative flex-shrink-0">
      {/* Avatar with brand ring for own profile */}
      <div
        className={`rounded-full ${isSelf ? 'ring-[2.5px] ring-brand-500 ring-offset-2' : ''}`}
        style={isSelf ? { boxShadow: '0 0 0 2px white, 0 0 0 4.5px #22c55e' } : undefined}
      >
        <Avatar src={avatarUrl} name={name} size="2xl" onClick={onAvatarClick} />
      </div>

      {/* Camera badge — bottom-right corner of avatar */}
      {isSelf && (
        <button
          ref={cameraBtnRef}
          onClick={handleCameraBadgeClick}
          disabled={set.isPending || remove.isPending}
          aria-label={avatarUrl ? 'Change or remove profile photo' : 'Add profile photo'}
          aria-expanded={avatarUrl ? menuOpen : undefined}
          aria-haspopup={avatarUrl ? 'menu' : undefined}
          className="absolute bottom-0 right-0 flex items-center justify-center w-7 h-7 rounded-full bg-brand-500 text-white border-2 border-white hover:bg-brand-600 transition-colors disabled:opacity-60"
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
      )}

      {/* ── Fixed-position action menu ────────────────────────────────────────
          Rendered with position:fixed so it escapes all overflow:hidden
          ancestors in the DOM tree (profile card, layout wrappers, etc.).
          Coordinates are calculated from the camera button's viewport rect
          at the moment of click. ─────────────────────────────────────────── */}
      {menuOpen && menuCoords && (
        <>
          {/* Full-screen backdrop — catches outside clicks */}
          <div
            className="fixed inset-0 z-[149]"
            onClick={closeMenu}
            aria-hidden
          />

          {/* Action menu */}
          <div
            role="menu"
            aria-label="Profile photo options"
            className="fixed z-[150] w-38 rounded-2xl py-1.5 animate-spring-in overflow-hidden"
            style={{
              bottom: menuCoords.bottom,
              left: menuCoords.left,
              width: 152,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <button
              role="menuitem"
              onClick={() => { closeMenu(); fileRef.current?.click() }}
              className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-gray-800 hover:bg-black/[0.04] transition-colors"
            >
              Change photo
            </button>
            <div className="mx-3 border-t border-black/[0.06]" />
            <button
              role="menuitem"
              onClick={() => { closeMenu(); remove.mutate() }}
              disabled={remove.isPending}
              className="w-full text-left px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50/80 transition-colors disabled:opacity-50"
            >
              {remove.isPending ? 'Removing…' : 'Remove photo'}
            </button>
          </div>
        </>
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
        <p className="absolute top-full left-1/2 -translate-x-1/2 mt-2 text-[10px] text-red-500 text-center w-28 leading-tight whitespace-normal z-10">
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
