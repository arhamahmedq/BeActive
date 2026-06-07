'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

const CALLBACK_ERRORS: Record<string, string> = {
  verification_failed:
    'Email verification link has expired or already been used. Please sign up again.',
  username_taken:
    'Your username was claimed by another user while you were verifying. Please sign up with a different one.',
  account_creation_failed:
    'Something went wrong creating your account. Please try again or contact support.',
  missing_username:
    'There was an issue with your signup. Please try again.',
  invalid_username:
    'There was an issue with your account setup. Please sign up again.',
  missing_code:
    'Invalid verification link. Please request a new one.',
}

interface FieldErrors {
  email?: string
  username?: string
  password?: string
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(
    callbackError
      ? (CALLBACK_ERRORS[callbackError] ?? 'Something went wrong. Please try again.')
      : null
  )
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFieldErrors({})
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error?.details) {
          const errors: FieldErrors = {}
          for (const detail of data.error.details as Array<{ field: string; message: string }>) {
            if (detail.field === 'email') errors.email = detail.message
            else if (detail.field === 'username') errors.username = detail.message
            else if (detail.field === 'password') errors.password = detail.message
          }
          setFieldErrors(errors)
        } else {
          setFormError(data.error?.message ?? 'Something went wrong. Please try again.')
        }
        return
      }

      // Both PENDING_VERIFICATION and VERIFICATION_RESENT land on verify-email
      router.push(`/verify-email?email=${encodeURIComponent(email)}`)
    } catch {
      setFormError('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h2 className="text-xl font-semibold mb-6">Create your account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
          autoComplete="email"
        />
        <Input
          id="username"
          label="Username"
          type="text"
          placeholder="your_username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          required
          autoComplete="username"
        />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="8+ characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            required
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" isLoading={isSubmitting} className="w-full mt-2">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-black hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 animate-pulse h-64" />
      }
    >
      <SignupForm />
    </Suspense>
  )
}
