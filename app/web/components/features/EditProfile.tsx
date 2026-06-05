'use client'
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'

async function patchProfile(body: { displayName: string | null; bio: string | null }): Promise<void> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Could not save your profile.')
}

// Owner-only display-name + bio editor (reuses PATCH /api/users/me — same endpoint
// as avatar). Collapsed to an "Edit profile" button; expands to an inline form.
export function EditProfile({
  username,
  displayName,
  bio,
}: {
  username: string
  displayName: string | null
  bio: string | null
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(displayName ?? '')
  const [bioText, setBioText] = useState(bio ?? '')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: () => patchProfile({ displayName: name.trim() || null, bio: bioText.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', username] })
      setOpen(false)
    },
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
      >
        Edit profile
      </button>
    )
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        save.mutate()
      }}
      className="bg-white rounded-xl border border-gray-100 p-4 space-y-3"
    >
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="Your name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Bio</label>
        <textarea
          value={bioText}
          onChange={(e) => setBioText(e.target.value)}
          maxLength={160}
          rows={3}
          placeholder="A short bio"
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        <p className="text-right text-[11px] text-gray-400">{bioText.length}/160</p>
      </div>
      {save.isError && <p className="text-xs text-red-500">Couldn’t save. Please try again.</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" isLoading={save.isPending}>
          Save
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-400 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
