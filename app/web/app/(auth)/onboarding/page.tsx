'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

export default function OnboardingPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [tzError, setTzError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Auto-detect the user's IANA timezone on mount.
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected) setTimezone(detected)
    } catch {
      setTimezone('UTC')
    }
  }, [])

  function validateTimezone(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz })
      return true
    } catch {
      return false
    }
  }

  function handleTimezoneChange(value: string) {
    setTimezone(value)
    if (value && !validateTimezone(value)) {
      setTzError('Must be a valid IANA timezone (e.g. America/New_York, Europe/London)')
    } else {
      setTzError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const tz = timezone.trim() || 'UTC'
    if (!validateTimezone(tz)) {
      setTzError('Must be a valid IANA timezone (e.g. America/New_York, Europe/London)')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          timezone: tz,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setFormError(data.error?.message ?? 'Could not save profile.')
        return
      }

      router.push('/feed')
    } catch {
      setFormError('Network error — please try again.')
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
        <div className="space-y-1">
          <Input
            id="timezone"
            label="Timezone"
            type="text"
            placeholder="America/New_York"
            value={timezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
          />
          {tzError ? (
            <p className="text-xs text-red-500">{tzError}</p>
          ) : timezone ? (
            <p className="text-xs text-gray-400">
              Detected: {timezone} — change if incorrect.
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={!!tzError}
          className="w-full"
        >
          Continue
        </Button>
      </form>
    </div>
  )
}
