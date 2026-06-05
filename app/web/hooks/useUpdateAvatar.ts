'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Reuses the existing R2 upload infra: sign (kind:'avatar') → PUT to R2 → PATCH
// /api/users/me with the key (server validates ownership + derives the URL).
async function uploadAvatar(file: File): Promise<void> {
  if (!ALLOWED.includes(file.type)) throw new Error('Use a JPEG, PNG, or WebP image.')
  if (file.size > MAX_BYTES) throw new Error('Image too large — max 5 MB.')

  const signRes = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mimeType: file.type, fileSize: file.size, kind: 'avatar' }),
  })
  if (!signRes.ok) throw new Error('Could not start the upload. Please try again.')
  const { uploadUrl, key } = (await signRes.json()) as { uploadUrl: string; key: string }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload failed. Please try again.')

  const patchRes = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarKey: key }),
  })
  if (!patchRes.ok) throw new Error('Could not save your profile picture.')
}

async function removeAvatarRequest(): Promise<void> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarKey: null }),
  })
  if (!res.ok) throw new Error('Could not remove your profile picture.')
}

// Avatar lives on User.avatarUrl (single source), surfaced via profile/feed/
// friends — so invalidate all three so the new picture propagates everywhere.
export function useUpdateAvatar() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['profile'] })
    void qc.invalidateQueries({ queryKey: ['feed'] })
    void qc.invalidateQueries({ queryKey: ['friends'] })
  }
  const set = useMutation({ mutationFn: uploadAvatar, onSuccess: invalidate })
  const remove = useMutation({ mutationFn: removeAvatarRequest, onSuccess: invalidate })
  return { set, remove }
}
