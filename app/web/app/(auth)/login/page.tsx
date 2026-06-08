'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

// Allowlist of paths a post-login redirect is permitted to target.
const ALLOWED_REDIRECT_PATHS = ['/feed', '/profile', '/upload', '/onboarding']

function getSafeRedirect(raw: string | null): string {
  if (!raw) return '/feed'
  try {
    const url = new URL(raw, 'http://localhost')
    if (url.hostname !== 'localhost') return '/feed'
    const path = url.pathname
    if (ALLOWED_REDIRECT_PATHS.some((p) => path.startsWith(p))) return path
  } catch {
    // malformed URL — ignore
  }
  return '/feed'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = getSafeRedirect(searchParams.get('redirectTo'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error?.code === 'EMAIL_NOT_VERIFIED') {
          setFormError(
            'Your email is not verified yet. Check your inbox for a confirmation link.'
          )
        } else if (res.status === 401) {
          setFormError('Invalid email or password.')
        } else {
          setFormError(data.error?.message ?? 'Something went wrong.')
        }
        return
      }

      router.push(redirectTo)
    } catch {
      setFormError('Network error. Please check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold mb-6 text-gray-900">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormError message={formError} />
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
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
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" variant="brand" isLoading={isSubmitting} className="w-full mt-2 rounded-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 animate-pulse h-64" />
      }
    >
      <LoginForm />
    </Suspense>
  )
}
