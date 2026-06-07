'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

const GOALS = [
  { id: 'consistent', icon: '📅', label: 'Stay consistent', sub: 'Build a daily workout habit' },
  { id: 'compete',    icon: '🏆', label: 'Beat my friends', sub: 'Friendly competition keeps me going' },
  { id: 'habit',      icon: '🔥', label: 'Build a habit',   sub: 'Streak-powered motivation' },
  { id: 'health',     icon: '💪', label: 'Get healthier',   sub: 'Feel better every day' },
]

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < step
              ? 'w-5 h-2 bg-brand-500'
              : i === step
                ? 'w-5 h-2 bg-brand-300'
                : 'w-2 h-2 bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (detected) setTimezone(detected)
    } catch { /* keep UTC */ }
  }, [])

  async function submitProfile() {
    setIsSubmitting(true)
    setFormError(null)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          timezone,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setFormError(data.error?.message ?? 'Could not save profile.')
        return false
      }
      return true
    } catch {
      setFormError('Network error — please try again.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStep1Continue() {
    const ok = await submitProfile()
    if (ok) setStep(1)
  }

  function handleStep2Continue() {
    if (selectedGoal) {
      try { localStorage.setItem('beactive:goal', selectedGoal) } catch { /* ignore */ }
    }
    setStep(2)
  }

  function handleStartWorkout() {
    router.push('/upload')
  }

  function handleSkip() {
    router.push('/feed')
  }

  // ── Step 1: Name ──────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <ProgressDots step={0} total={3} />

        <div className="text-center mb-7">
          <p className="text-3xl mb-3" aria-hidden>👋</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Welcome to BeActive!</h2>
          <p className="text-sm text-gray-500 mt-2">What should we call you?</p>
        </div>

        <FormError message={formError} />

        <div className="space-y-4">
          <Input
            id="displayName"
            label="Display name (optional)"
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-gray-400">
            Timezone auto-detected: <span className="font-medium text-gray-600">{timezone.replace(/_/g, ' ')}</span>
          </p>
          <Button
            onClick={handleStep1Continue}
            isLoading={isSubmitting}
            variant="brand"
            className="w-full rounded-full"
          >
            Continue →
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: Goal selection ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <ProgressDots step={1} total={3} />

        <div className="text-center mb-6">
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Why are you here?</h2>
          <p className="text-sm text-gray-500 mt-1">Pick what drives you</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {GOALS.map(({ id, icon, label, sub }) => (
            <button
              key={id}
              onClick={() => setSelectedGoal(id)}
              className={`flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left transition-all duration-150 ${
                selectedGoal === id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="text-2xl" aria-hidden>{icon}</span>
              <span className={`text-sm font-semibold leading-tight ${selectedGoal === id ? 'text-brand-700' : 'text-gray-900'}`}>{label}</span>
              <span className="text-xs text-gray-500 leading-tight">{sub}</span>
            </button>
          ))}
        </div>

        <Button
          onClick={handleStep2Continue}
          variant="brand"
          className="w-full rounded-full"
        >
          Continue →
        </Button>
        <button
          onClick={handleStep2Continue}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors mt-3"
        >
          Skip
        </button>
      </div>
    )
  }

  // ── Step 3: Start streak ──────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <ProgressDots step={2} total={3} />

      <div className="text-center mb-8 space-y-3">
        <p className="text-5xl" aria-hidden>🔥</p>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Your streak starts today</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
          Post one photo of your workout each day to keep it alive. Miss a day, start over.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={handleStartWorkout}
          variant="brand"
          className="w-full rounded-full py-3 text-base"
        >
          📸 Log my first workout
        </Button>
        <button
          onClick={handleSkip}
          className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors py-2"
        >
          I&apos;ll do it later
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center mt-5">
        You can always log in at{' '}
        <Link href="/feed" className="underline">your feed</Link>.
      </p>
    </div>
  )
}
