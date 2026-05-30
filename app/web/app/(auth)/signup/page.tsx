'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'

interface FieldErrors {
  email?: string
  username?: string
  password?: string
}

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
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

      router.push('/onboarding')
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
        <Input
          id="password"
          label="Password"
          type="password"
          placeholder="8+ characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
          autoComplete="new-password"
        />
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
