'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleResend() {
    setResendState('sending')
    setError(null)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResendState('sent')
    } catch {
      setError('Something went wrong. Please try again.')
      setResendState('idle')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Check your email</h2>
        <p className="text-sm text-gray-500">
          We sent a confirmation link to{' '}
          {email ? (
            <strong className="text-gray-800">{email}</strong>
          ) : (
            'your email address'
          )}
          . Click it to activate your account.
        </p>
      </div>

      {resendState === 'sent' ? (
        <p className="text-sm text-green-600 font-medium">Confirmation email resent!</p>
      ) : (
        <Button
          type="button"
          variant="ghost"
          isLoading={resendState === 'sending'}
          onClick={handleResend}
          className="w-full"
        >
          Resend confirmation email
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-6 text-sm text-gray-400">
        Wrong email?{' '}
        <Link href="/signup" className="text-black hover:underline">
          Sign up again
        </Link>
        {' · '}
        <Link href="/login" className="text-black hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 animate-pulse h-48" />
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
