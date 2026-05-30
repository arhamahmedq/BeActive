'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

export default function OnboardingPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() || null }),
      })

      if (!res.ok) {
        // /api/users/me not built yet (Slice 1 partial) — skip gracefully
        if (res.status === 404) {
          router.push('/feed')
          return
        }
        const data = await res.json()
        setFormError(data.error?.message ?? 'Could not save profile.')
        return
      }

      router.push('/feed')
    } catch {
      // Network error — skip onboarding gracefully
      router.push('/feed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-semibold mb-2">Welcome to BeActive!</h2>
      <p className="text-sm text-gray-500 mb-6">Let&apos;s set up your profile.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />
        <Input
          id="displayName"
          label="Display name (optional)"
          type="text"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Continue
        </Button>
        <button
          type="button"
          onClick={() => router.push('/feed')}
          className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
        >
          Skip for now
        </button>
      </form>
    </div>
  )
}
